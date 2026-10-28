import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { OperationsStore } from '../src/services/operational-analytics.js';
import { createApp } from '../src/app.js';

const directories: string[] = [];
const stores: OperationsStore[] = [];
function store() {
  const directory = mkdtempSync(path.join(tmpdir(), 'ttsave-analytics-test-'));
  directories.push(directory);
  const instance = new OperationsStore(
    directory,
    'test-key-that-is-more-than-32-characters',
  );
  stores.push(instance);
  return instance;
}
afterEach(() => {
  for (const instance of stores.splice(0)) instance.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('private operational analytics', () => {
  it('deduplicates preparation and delivery, and stores no original identifiers', () => {
    const analytics = store();
    analytics.startJob('SECRET-JOB-TOKEN', 'mp4', 'LK');
    analytics.startJob('SECRET-JOB-TOKEN', 'mp4', 'LK');
    analytics.updateJob('SECRET-JOB-TOKEN', 'ready');
    expect(analytics.report().totals).toMatchObject({
      attempts: 1,
      prepared: 1,
      delivered: 0,
    });
    analytics.updateJob('SECRET-JOB-TOKEN', 'delivering');
    expect(analytics.report().totals.delivered).toBe(0);
    analytics.updateJob('SECRET-JOB-TOKEN', 'delivered');
    analytics.updateJob('SECRET-JOB-TOKEN', 'delivered');
    analytics.updateJob('SECRET-JOB-TOKEN', 'expired');
    const report = analytics.report();
    expect(report.totals).toMatchObject({ attempts: 1, prepared: 1, delivered: 1 });
    expect(report.countries).toEqual([{ country: 'LK', count: 1 }]);
    expect(JSON.stringify(analytics.rows('SELECT * FROM jobs'))).not.toContain('SECRET');
  });

  it('does not count failed or cancelled transfers as delivered', () => {
    const analytics = store();
    for (const status of ['error', 'cancelled']) {
      analytics.startJob(status, 'image');
      analytics.updateJob(status, 'ready');
      analytics.updateJob(status, 'delivering');
      analytics.updateJob(status, status);
    }
    expect(analytics.report().totals).toMatchObject({
      attempts: 2,
      prepared: 2,
      delivered: 0,
      failed: 1,
      cancelled: 1,
    });
  });

  it('opening a reporting connection does not interrupt active downloads', () => {
    const analytics = store();
    analytics.startJob('active', 'zip');
    const reader = new OperationsStore(
      analytics.directory,
      'test-key-that-is-more-than-32-characters',
      30,
      false,
    );
    stores.push(reader);
    expect(reader.report().active).toBe(1);
    expect(analytics.report().jobs[0]?.status).toBe('queued');
  });

  it('validates report ranges and filters', () => {
    const analytics = store();
    expect(() => analytics.report({ from: '2026-02-30' })).toThrow();
    expect(() => analytics.report({ from: '2020-01-01', to: '2026-01-01' })).toThrow();
    expect(() => analytics.report({ type: "mp4' OR 1=1" })).toThrow();
  });
  it('keeps media-filtered totals, daily totals, distribution and countries consistent', () => {
    const analytics = store();
    analytics.startJob('video', 'mp4', 'LK');
    analytics.updateJob('video', 'ready');
    analytics.updateJob('video', 'delivered');
    analytics.startJob('photo', 'image', 'US');
    analytics.updateJob('photo', 'ready');
    const report = analytics.report({ type: 'mp4' });
    expect(report.totals).toMatchObject({ attempts: 1, prepared: 1, delivered: 1 });
    expect(report.distribution).toEqual([{ type: 'mp4', count: 1 }]);
    expect(report.byType).toEqual([
      { type: 'mp4', attempts: 1, delivered: 1, failed: 0 },
    ]);
    expect(report.countries).toEqual([{ country: 'LK', count: 1 }]);
    expect(report.daily[0]).toMatchObject({ attempts: 1, prepared: 1, delivered: 1 });
  });
  it('includes retained daily aggregates in charts as well as headline totals', () => {
    const analytics = store();
    const day = new Date().toISOString().slice(0, 10);
    analytics.run(
      'INSERT INTO daily VALUES(?,?,?,?,?,?,?,?,?)',
      day,
      'mp4',
      5,
      4,
      3,
      1,
      0,
      100,
      1,
    );
    const report = analytics.report({ type: 'mp4' });
    expect(report.totals.attempts).toBe(5);
    expect(report.distribution).toEqual([{ type: 'mp4', count: 5 }]);
    expect(report.byType).toEqual([
      { type: 'mp4', attempts: 5, delivered: 3, failed: 1 },
    ]);
    expect(report.daily).toEqual([{ day, attempts: 5, prepared: 4, delivered: 3 }]);
  });
  it('expires prepared records after a real restart without inventing delivery', () => {
    const analytics = store();
    analytics.startJob('prepared', 'image');
    analytics.updateJob('prepared', 'ready');
    const restarted = new OperationsStore(
      analytics.directory,
      'test-key-that-is-more-than-32-characters',
    );
    stores.push(restarted);
    expect(restarted.report().jobs[0]).toMatchObject({
      status: 'expired',
      code: 'PROCESS_RESTARTED',
    });
    expect(restarted.report().totals).toMatchObject({ prepared: 1, delivered: 0 });
  });

  it('has no public admin or reporting endpoints', async () => {
    const app = createApp(undefined, undefined, undefined, { store: store() });
    for (const route of [
      '/admin',
      '/admin/login',
      '/admin/analytics',
      '/admin/settings',
    ]) {
      const response = await request(app).get(route).expect(404);
      expect(response.headers['x-robots-tag']).toContain('noindex');
      expect(response.text).not.toMatch(/analytics-init|operations.sqlite|<form/);
    }
  });
});
