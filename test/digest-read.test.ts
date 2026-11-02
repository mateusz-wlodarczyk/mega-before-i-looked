import { describe, expect, it } from 'vitest';
import { digest, readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(n!.badLines).toBe(1);
  });

  it('counts runs, retries and keeps the last status and error', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const fixtures = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(fixtures).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(fixtures.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(fixtures.lastAt).toBe('2026-10-29T01:37:00+01:00');
    const backup = rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('an empty file is a night with no rows', () => {
    expect(digest('2026-10-30', '')).toEqual({
      night: '2026-10-30',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts lines with the wrong shape as bad, never throws', () => {
    const n = digest('x', '{"at":"t","job":"a","status":"maybe","owner":null}\n[1]\nnot json\n');
    expect(n.badLines).toBe(3);
    expect(n.rows).toEqual([]);
  });
});
