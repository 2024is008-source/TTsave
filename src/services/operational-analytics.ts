import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  chmodSync,
  mkdirSync,
  realpathSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';

export const mediaTypes = ['mp4', 'mp3', 'image', 'zip', 'unknown'] as const;
export type MediaType = (typeof mediaTypes)[number];
export const systemCodes = new Set([
  'INTERNAL_SERVER_ERROR',
  'TOOL_UNAVAILABLE',
  'FFMPEG_FAILED',
  'CLEANUP_FAILED',
  'PROCESS_RESTARTED',
  'INVALID_SERVICE_RESPONSE',
  'DELIVERY_FAILED',
]);
const safeCode = (code: string) =>
  /^[A-Z][A-Z0-9_]{1,59}$/.test(code) ? code : 'INTERNAL_SERVER_ERROR';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
export const rangeSchema = z
  .object({
    from: date.optional(),
    to: date.optional(),
    type: z.enum(mediaTypes).optional(),
    severity: z.enum(['all', 'system', 'source']).default('all'),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'Choose an ordered date range.',
  );
type Row = Record<string, string | number | null>;

/** Private single-host storage. No source URLs, IPs, captions or capabilities enter it. */
export class OperationsStore {
  private readonly connection: DatabaseSync;
  readonly runtime = randomUUID();
  private cleaned = 0;
  constructor(
    readonly directory: string,
    private readonly secret: string,
    readonly retentionDays = 30,
    recoverInterrupted = true,
  ) {
    const publicRoot = path.resolve('public');
    if (
      !path.isAbsolute(directory) ||
      directory === publicRoot ||
      directory.startsWith(publicRoot + path.sep)
    )
      throw Error('Use private absolute operational storage.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const resolved = realpathSync(directory);
    if (
      resolved === realpathSync(publicRoot) ||
      resolved.startsWith(realpathSync(publicRoot) + path.sep)
    )
      throw Error('Operational storage resolves inside public.');
    const filename = path.join(resolved, 'operations.sqlite');
    this.connection = new DatabaseSync(filename);
    if (process.platform !== 'win32') chmodSync(filename, 0o600);
    this.connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,operation TEXT NOT NULL,stage TEXT NOT NULL,type TEXT NOT NULL,code TEXT,country TEXT NOT NULL,duration INTEGER,created INTEGER NOT NULL,UNIQUE(operation,stage));
      CREATE INDEX IF NOT EXISTS event_dates ON events(created,stage);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,runtime TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,started INTEGER NOT NULL,prepared INTEGER,delivered INTEGER,finished INTEGER,duration INTEGER,code TEXT,country TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS job_dates ON jobs(started,type);
      CREATE TABLE IF NOT EXISTS daily(day TEXT NOT NULL,type TEXT NOT NULL,attempts INTEGER NOT NULL,prepared INTEGER NOT NULL,delivered INTEGER NOT NULL,failed INTEGER NOT NULL,cancelled INTEGER NOT NULL,duration INTEGER NOT NULL,samples INTEGER NOT NULL,PRIMARY KEY(day,type));`);
    this.run(
      'INSERT OR IGNORE INTO metadata VALUES(?,?)',
      'tracking_started',
      String(Date.now()),
    );
    if (recoverInterrupted)
      this.run(
        "UPDATE jobs SET status='error',finished=?,code='PROCESS_RESTARTED' WHERE status IN ('queued','downloading','delivering')",
        Date.now(),
      );
    if (recoverInterrupted)
      this.run(
        "UPDATE jobs SET status='expired',finished=?,code='PROCESS_RESTARTED' WHERE status='ready'",
        Date.now(),
      );
  }
  key(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }
  run(sql: string, ...values: SQLInputValue[]) {
    return this.connection.prepare(sql).run(...values);
  }
  rows(sql: string, ...values: SQLInputValue[]): Row[] {
    return this.connection.prepare(sql).all(...values) as Row[];
  }
  row(sql: string, ...values: SQLInputValue[]): Row | undefined {
    return this.connection.prepare(sql).get(...values) as Row | undefined;
  }
  transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
  event(
    id: string,
    stage: string,
    type: MediaType = 'unknown',
    code?: string,
    duration?: number,
    country = 'XX',
  ) {
    if (
      ![
        'analysis.started',
        'analysis.valid',
        'analysis.failed',
        'request.rejected',
        'download.rejected',
      ].includes(stage)
    )
      throw Error('Unknown operational stage.');
    this.run(
      'INSERT OR IGNORE INTO events(operation,stage,type,code,country,duration,created) VALUES(?,?,?,?,?,?,?)',
      this.key(id),
      stage,
      type,
      code ? safeCode(code) : null,
      /^[A-Z]{2}$/.test(country) ? country : 'XX',
      duration ?? null,
      Date.now(),
    );
    this.cleanup();
  }
  startJob(id: string, type: MediaType, country = 'XX') {
    this.run(
      "INSERT OR IGNORE INTO jobs(id,runtime,type,status,started,country) VALUES(?,?,?,'queued',?,?)",
      this.key(id),
      this.runtime,
      type,
      Date.now(),
      country,
    );
  }
  updateJob(id: string, status: string, code?: string) {
    if (
      ![
        'queued',
        'downloading',
        'ready',
        'delivering',
        'delivered',
        'cancelled',
        'error',
        'expired',
      ].includes(status)
    )
      return;
    const key = this.key(id),
      current = this.row('SELECT * FROM jobs WHERE id=?', key);
    if (!current || current.status === 'delivered' || current.status === status) return;
    const now = Date.now();
    this.run(
      "UPDATE jobs SET status=?,prepared=CASE WHEN ?='ready' THEN COALESCE(prepared,?) ELSE prepared END,delivered=CASE WHEN ?='delivered' THEN COALESCE(delivered,?) ELSE delivered END,finished=CASE WHEN ? IN ('delivered','cancelled','error','expired') THEN COALESCE(finished,?) ELSE finished END,duration=CASE WHEN ?='ready' THEN COALESCE(duration,?) ELSE duration END,code=COALESCE(?,code) WHERE id=?",
      status,
      status,
      now,
      status,
      now,
      status,
      now,
      status,
      Math.max(0, now - Number(current.started)),
      code ? safeCode(code) : null,
      key,
    );
    this.cleanup();
  }
  report(input: unknown = {}) {
    const parsed = rangeSchema.parse(input),
      today = new Date().toISOString().slice(0, 10);
    const from =
        parsed.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      to = parsed.to ?? today;
    if (from > to || Date.parse(to) - Date.parse(from) > 729 * 86400000)
      throw Error('Choose up to 730 days.');
    const start = Date.parse(from),
      end = Date.parse(to) + 86400000;
    const clause = parsed.type ? ' AND type=?' : '',
      values: SQLInputValue[] = [start, end, ...(parsed.type ? [parsed.type] : [])];
    const jobs = this.rows(
      'SELECT type,status,started,prepared,delivered,finished,duration,code,country FROM jobs WHERE started>=? AND started<?' +
        clause +
        ' ORDER BY started DESC LIMIT 100',
      ...values,
    );
    const current =
      this.row(
        "SELECT COUNT(*) attempts,COALESCE(SUM(prepared IS NOT NULL),0) prepared,COALESCE(SUM(delivered IS NOT NULL),0) delivered,COALESCE(SUM(status='error'),0) failed,COALESCE(SUM(status='cancelled'),0) cancelled,COALESCE(SUM(duration),0) duration,COALESCE(SUM(duration IS NOT NULL),0) samples FROM jobs WHERE started>=? AND started<?" +
          clause,
        ...values,
      ) ?? {};
    const retained =
      this.row(
        'SELECT COALESCE(SUM(attempts),0) attempts,COALESCE(SUM(prepared),0) prepared,COALESCE(SUM(delivered),0) delivered,COALESCE(SUM(failed),0) failed,COALESCE(SUM(cancelled),0) cancelled,COALESCE(SUM(duration),0) duration,COALESCE(SUM(samples),0) samples FROM daily WHERE day>=? AND day<=?' +
          clause,
        from,
        to,
        ...(parsed.type ? [parsed.type] : []),
      ) ?? {};
    const totals = Object.fromEntries(
      [
        'attempts',
        'prepared',
        'delivered',
        'failed',
        'cancelled',
        'duration',
        'samples',
      ].map((key) => [key, Number(current[key] ?? 0) + Number(retained[key] ?? 0)]),
    );
    const byType = this.rows(
      "SELECT type,SUM(attempts) attempts,SUM(delivered) delivered,SUM(failed) failed FROM (SELECT type,COUNT(*) attempts,SUM(delivered IS NOT NULL) delivered,SUM(status='error') failed FROM jobs WHERE started>=? AND started<?" +
        clause +
        ' GROUP BY type UNION ALL SELECT type,SUM(attempts) attempts,SUM(delivered) delivered,SUM(failed) failed FROM daily WHERE day>=? AND day<=?' +
        clause +
        ' GROUP BY type) GROUP BY type ORDER BY type',
      ...values,
      from,
      to,
      ...(parsed.type ? [parsed.type] : []),
    );
    const distribution = byType.map((row) => ({
      type: row.type ?? 'unknown',
      count: row.attempts ?? 0,
    }));
    const errors = this.rows(
      'SELECT stage,type,code,created FROM events WHERE created>=? AND created<? AND code IS NOT NULL' +
        clause +
        " UNION ALL SELECT 'job' stage,type,code,COALESCE(finished,started) created FROM jobs WHERE started>=? AND started<? AND code IS NOT NULL" +
        clause +
        ' ORDER BY created DESC LIMIT 100',
      ...values,
      ...values,
    ).filter(
      (row) =>
        parsed.severity === 'all' ||
        (systemCodes.has(String(row.code))
          ? parsed.severity === 'system'
          : parsed.severity === 'source'),
    );
    const analysis = this.rows(
      'SELECT stage,COUNT(*) count FROM events WHERE created>=? AND created<? GROUP BY stage',
      start,
      end,
    );
    const countries = this.rows(
      'SELECT country,COUNT(*) count FROM jobs WHERE started>=? AND started<?' +
        clause +
        ' GROUP BY country ORDER BY count DESC',
      ...values,
    );
    const daily = this.rows(
      "SELECT day,SUM(attempts) attempts,SUM(prepared) prepared,SUM(delivered) delivered FROM (SELECT substr(datetime(started/1000,'unixepoch'),1,10) day,COUNT(*) attempts,SUM(prepared IS NOT NULL) prepared,SUM(delivered IS NOT NULL) delivered FROM jobs WHERE started>=? AND started<?" +
        clause +
        ' GROUP BY day UNION ALL SELECT day,attempts,prepared,delivered FROM daily WHERE day>=? AND day<=?' +
        clause +
        ') GROUP BY day ORDER BY day',
      ...values,
      from,
      to,
      ...(parsed.type ? [parsed.type] : []),
    );
    return {
      range: { from, to, type: parsed.type ?? '', severity: parsed.severity },
      totals,
      distribution,
      byType,
      errors,
      analysis,
      countries,
      daily,
      jobs,
      trackingStarted: Number(
        this.row("SELECT value FROM metadata WHERE key='tracking_started'")?.value,
      ),
      active: Number(
        this.row(
          "SELECT COUNT(*) count FROM jobs WHERE status IN ('queued','downloading','delivering')",
        )?.count ?? 0,
      ),
    };
  }
  cleanup() {
    if (Date.now() - this.cleaned < 3600000) return;
    this.cleaned = Date.now();
    const cutoff = Date.now() - this.retentionDays * 86400000;
    this.transaction(() => {
      this.run(
        "INSERT INTO daily SELECT substr(datetime(started/1000,'unixepoch'),1,10),type,COUNT(*),SUM(prepared IS NOT NULL),SUM(delivered IS NOT NULL),SUM(status='error'),SUM(status='cancelled'),COALESCE(SUM(duration),0),SUM(duration IS NOT NULL) FROM jobs WHERE started<? AND status NOT IN ('queued','downloading','delivering') GROUP BY 1,2 ON CONFLICT(day,type) DO UPDATE SET attempts=attempts+excluded.attempts,prepared=prepared+excluded.prepared,delivered=delivered+excluded.delivered,failed=failed+excluded.failed,cancelled=cancelled+excluded.cancelled,duration=duration+excluded.duration,samples=samples+excluded.samples",
        cutoff,
      );
      this.run(
        "DELETE FROM jobs WHERE started<? AND status NOT IN ('queued','downloading','delivering')",
        cutoff,
      );
      this.run('DELETE FROM events WHERE created<?', cutoff);
      this.run(
        'DELETE FROM daily WHERE day<?',
        new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10),
      );
    });
  }
  close() {
    this.connection.close();
  }
}
let shared: OperationsStore | undefined;
export function operationsStore(reportOnly = false): OperationsStore | undefined {
  if (!env.OPERATIONS_ENABLED) return undefined;
  mkdirSync(env.OPERATIONS_DATA_DIR, { recursive: true, mode: 0o700 });
  const resolved = realpathSync(env.OPERATIONS_DATA_DIR);
  const publicRoot = realpathSync(path.resolve('public'));
  if (resolved === publicRoot || resolved.startsWith(publicRoot + path.sep))
    throw Error('Operational storage resolves inside public.');
  const keyFile = path.join(resolved, 'operations.key');
  if (!env.OPERATIONS_SECRET && !existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const secret = env.OPERATIONS_SECRET ?? readFileSync(keyFile, 'utf8').trim();
  if (secret.length < 32) throw Error('Invalid operational storage key.');
  if (reportOnly)
    return new OperationsStore(resolved, secret, env.OPERATIONS_RETENTION_DAYS, false);
  return (shared ??= new OperationsStore(
    env.OPERATIONS_DATA_DIR,
    secret,
    env.OPERATIONS_RETENTION_DAYS,
  ));
}
