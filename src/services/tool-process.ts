import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { Logger } from 'pino';
import { HttpError } from '../middleware/error-handler.js';

export type AnalysisContext = { signal: AbortSignal; requestId: string; logger: Logger };
export type ProcessLimits = { timeoutMs: number; maxOutputBytes: number };
export type ToolResult = { stdout: string; stderr: string; code: number | null };
const activeStops = new Set<() => void>();

export function stopRunningTools() {
  for (const stop of activeStops) stop();
}

// Avoid passing application secrets, proxies or Python plugin configuration to tools.
function toolEnvironment(): NodeJS.ProcessEnv {
  const names = [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
    'HOME',
    'LANG',
    'LC_ALL',
  ];
  return Object.fromEntries(
    names.flatMap((name) =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]],
    ),
  );
}

export function runTool(
  executable: string,
  args: string[],
  limits: ProcessLimits,
  context: AnalysisContext,
): Promise<ToolResult> {
  if (context.signal.aborted)
    return Promise.reject(
      new HttpError(499, 'REQUEST_CANCELLED', 'The analysis request was cancelled.'),
    );
  return new Promise((resolve, reject) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: toolEnvironment(),
      });
    } catch {
      reject(
        new HttpError(503, 'TOOL_UNAVAILABLE', 'The video analysis tool is unavailable.'),
      );
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    context.logger.info({ requestId: context.requestId }, 'External tool started');
    const cleanup = () => {
      clearTimeout(timer);
      context.signal.removeEventListener('abort', abort);
      activeStops.delete(abort);
    };
    const stop = (error: HttpError) => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      cleanup();
      context.logger.warn(
        { requestId: context.requestId, code: error.code },
        'External tool stopped',
      );
      reject(error);
    };
    const abort = () =>
      stop(
        new HttpError(499, 'REQUEST_CANCELLED', 'The analysis request was cancelled.'),
      );
    const timer = setTimeout(
      () =>
        stop(
          new HttpError(
            504,
            'ANALYSIS_TIMEOUT',
            'Video analysis took too long. Please try again.',
          ),
        ),
      limits.timeoutMs,
    );
    timer.unref();
    activeStops.add(abort);
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    const capture = (stream: 'stdout' | 'stderr', data: Buffer) => {
      if (settled) return;
      totalBytes += data.byteLength;
      if (stream === 'stderr') stderrBytes += data.byteLength;
      if (totalBytes > limits.maxOutputBytes || stderrBytes > 65_536) {
        stop(
          new HttpError(
            502,
            'ANALYSIS_OUTPUT_LIMIT',
            'The video response was too large to analyze safely.',
          ),
        );
        return;
      }
      (stream === 'stdout' ? stdout : stderr).push(data);
    };
    child.stdout.on('data', (data: Buffer) => capture('stdout', data));
    child.stderr.on('data', (data: Buffer) => capture('stderr', data));
    child.on('error', () => {
      if (settled) return;
      settled = true;
      cleanup();
      context.logger.warn(
        { requestId: context.requestId, code: 'TOOL_UNAVAILABLE' },
        'External tool failed to start',
      );
      reject(
        new HttpError(503, 'TOOL_UNAVAILABLE', 'The video analysis tool is unavailable.'),
      );
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      context.logger.info(
        { requestId: context.requestId, exitCode: code, outputBytes: totalBytes },
        'External tool exited',
      );
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code,
      });
    });
  });
}
