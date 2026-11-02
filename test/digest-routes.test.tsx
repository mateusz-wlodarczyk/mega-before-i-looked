import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Temp runs dir: the repo's runs/ is read-only fixtures and never written to.
const NORMAL = '2026-11-01';
const EMPTY = '2026-11-02';
const BAD = '2026-11-03';
const MISSING = '2026-01-01';

const normalLines = [
  { at: '2026-11-01T01:00:00+01:00', job: 'sync/zeta', status: 'fail', owner: 'ana', error: 'quota exceeded' },
  { at: '2026-11-01T01:05:00+01:00', job: 'render/alpha', status: 'retry', owner: null, error: 'timeout' },
  { at: '2026-11-01T01:06:00+01:00', job: 'render/alpha', status: 'retry', owner: null, error: 'timeout' },
  { at: '2026-11-01T01:07:00+01:00', job: 'render/alpha', status: 'retry', owner: null, error: 'timeout' },
  { at: '2026-11-01T01:08:00+01:00', job: 'render/alpha', status: 'ok', owner: null },
  { at: '2026-11-01T01:10:00+01:00', job: 'backup/mid', status: 'ok', owner: 'bo' },
];

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  const bad = [
    JSON.stringify({ at: '2026-11-03T01:00:00+01:00', job: 'sync/one', status: 'ok', owner: 'ana' }),
    '{"at":"2026-11-03T01:01:00+01:00","job":"sync/two","sta',
    JSON.stringify({ at: '2026-11-03T01:02:00+01:00', job: 'sync/three', status: 'fail', owner: null, error: 'boom' }),
  ];
  writeFileSync(join(runsDir, `${BAD}.jsonl`), bad.join('\n') + '\n');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  get runsDir() {
    return runsDir;
  },
};

// hono/jsx escapes the apostrophe in text, so decode it before matching the copy.
const text = (html: string) => html.replaceAll('&#39;', "'");

describe('GET /digest/:night', () => {
  it('200 for a normal night, with the jobs in the table', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`digest ${NORMAL}`);
    expect(html).toContain('<td>render/alpha</td>');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('empty night says "nothing ran"', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(text(await res.text())).toContain('nothing ran');
  });

  it('bad-line night is still 200 and says "1 line didn\'t parse"', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    const html = text(await res.text());
    expect(html).toContain("1 line didn't parse");
    expect(html).toContain('<td>sync/one</td>');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a normal night, with the digest shape', async () => {
    const res = await createApp(config).request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ night: NORMAL, badLines: 0, counts: { ok: 2, retry: 3, fail: 1 } });
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('empty night has rows: []', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: EMPTY, rows: [] });
  });

  it('bad-line night is still 200 with badLines: 1', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: BAD, badLines: 1 });
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for the normal night', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const json = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as { rows: { job: string }[] };

    const jobs = json.rows.map((r) => r.job);
    expect(jobs).toEqual(['backup/mid', 'render/alpha', 'sync/zeta']);

    const positions = jobs.map((j) => html.indexOf(`<td>${j}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
