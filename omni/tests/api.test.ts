import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { validateFiles } from '../worker/ai';
let mf: Miniflare;
let cookie = '';
let mode: 'success' | 'rate' | 'invalid' = 'success';
let inferenceCalls = 0;
let freeAccount = true;
const password = 'integration-test-password-123';
const origin = 'https://omni.test';
async function request(
  path: string,
  data?: unknown,
  authenticated = true,
  extra: Record<string, string> = {},
) {
  return mf.dispatchFetch(`${origin}/api${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(data === undefined
        ? {}
        : { 'Content-Type': 'application/json', Origin: origin }),
      ...(authenticated ? { Cookie: cookie } : {}),
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function create(
  kind = 'chat',
  objective = 'Explain bounded execution',
  model = '',
) {
  const response = await request('/tasks', { kind, objective, model });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; status: string };
}
beforeAll(async () => {
  const bundled = await build({
    entryPoints: ['worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  mf = new Miniflare({
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-08-01',
    d1Databases: ['DB'],
    bindings: { ADMIN_PASSWORD: password, OPENROUTER_API_KEY: 'test-only-key' },
    outboundService: async (req) => {
      if (req.url.endsWith('/key'))
        return Response.json({ data: { is_free_tier: freeAccount } });
      if (req.url.endsWith('/models'))
        return Response.json({
          data: [
            {
              id: 'test/a:free',
              name: 'Free A',
              pricing: { prompt: '0', completion: '0' },
            },
            {
              id: 'test/b:free',
              name: 'Free B',
              pricing: { prompt: '0', completion: '0' },
            },
            {
              id: 'test/paid',
              name: 'Paid',
              pricing: { prompt: '1', completion: '2' },
            },
            {
              id: 'test/hidden:free',
              name: 'Extra fee',
              pricing: { prompt: '0', completion: '0', request: '1' },
            },
          ],
        });
      inferenceCalls++;
      const payload = (await req.json()) as {
        model: string;
        provider: { max_price: { prompt: number; completion: number } };
      };
      expect(payload.model).toMatch(/:free$/);
      expect(payload.provider.max_price).toEqual({ prompt: 0, completion: 0 });
      if (mode === 'rate') return new Response('', { status: 429 });
      return Response.json({
        choices: [
          {
            message: {
              content:
                mode === 'invalid'
                  ? '{"summary":"bad","files":[{"path":"../secret","content":"bad"}]}'
                  : '{"summary":"Generated","files":[{"path":"index.html","content":"<h1>Hi</h1>"},{"path":"style.css","content":"h1{color:blue}"}]}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 30, cost: 0 },
      });
    },
  });
  const db = await mf.getD1Database('DB');
  const sql =
    (await readFile('migrations/0001_initial.sql', 'utf8')) +
    (await readFile('migrations/0002_revisions.sql', 'utf8'));
  for (const statement of sql.split(';').filter((s) => s.trim()))
    await db.prepare(statement).run();
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
describe('Workers API with real local D1 and mocked provider only', () => {
  it('reports database health without leaking secrets', async () => {
    const response = await request('/health', undefined, false);
    expect(await response.json()).toEqual({
      ok: true,
      database: 'connected',
      authentication: 'configured',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
  it('protects data routes and rejects cross-origin requests', async () => {
    expect((await request('/tasks', undefined, false)).status).toBe(401);
    expect(
      (
        await request('/login', { password }, false, {
          Origin: 'https://evil.test',
        })
      ).status,
    ).toBe(403);
    expect((await request('/login', { password: 'wrong' }, false)).status).toBe(
      401,
    );
  });
  it('creates a secure, hashed, server-persisted session', async () => {
    const response = await request('/login', { password }, false);
    expect(response.status).toBe(200);
    const raw = response.headers.get('set-cookie')!;
    expect(raw).toContain('HttpOnly; Secure; SameSite=Strict');
    cookie = raw.split(';')[0];
    expect((await request('/me')).status).toBe(200);
    const db = await mf.getD1Database('DB');
    const stored = await db
      .prepare('SELECT token_hash FROM sessions')
      .first<{ token_hash: string }>();
    expect(stored?.token_hash).not.toBe(cookie.split('=')[1]);
  });
  it('validates objectives, kind, content type and body size', async () => {
    expect(
      (await request('/tasks', { kind: 'shell', objective: 'rm -rf /' }))
        .status,
    ).toBe(400);
    expect(
      (await request('/tasks', { kind: 'chat', objective: 'a' })).status,
    ).toBe(400);
    expect(
      (await request('/tasks', { kind: 'chat', objective: 'a'.repeat(17000) }))
        .status,
    ).toBe(413);
    expect(
      (await request('/tasks', {}, true, { 'Content-Type': 'text/plain' }))
        .status,
    ).toBe(415);
  });
  it('lists only catalog-verified free models', async () => {
    const response = await request('/models');
    const data = (await response.json()) as { models: { id: string }[] };
    expect(data.models.map((m) => m.id)).toEqual([
      'test/a:free',
      'test/b:free',
    ]);
    expect(
      JSON.stringify(await (await request('/providers')).json()),
    ).not.toContain('test-only-key');
  });
  it('persists and runs a website task, stores source, usage, logs and audit', async () => {
    const task = await create('website');
    expect(task.status).toBe('queued');
    const response = await request(`/tasks/${task.id}/run`, {});
    const result = (await response.json()) as {
      status: string;
      result: string;
      steps: string;
      usage: string;
    };
    expect(result.status).toBe('completed');
    expect(JSON.parse(result.result).files[0].path).toBe('index.html');
    expect(JSON.parse(result.steps).length).toBe(3);
    expect(JSON.parse(result.usage).estimated_cost_usd).toBe(0);
    expect((await request(`/tasks/${task.id}/run`, {})).status).toBe(409);
    const history = (await (await request('/tasks')).json()) as {
      id: string;
    }[];
    expect(history.some((t) => t.id === task.id)).toBe(true);
    const events = (await (await request('/audit')).json()) as {
      action: string;
    }[];
    expect(events.some((e) => e.action === 'task.completed')).toBe(true);
  });
  it('blocks paid model selection before inference', async () => {
    const count = inferenceCalls;
    const task = await create('chat', 'Do something useful', 'test/paid');
    const result = (await (
      await request(`/tasks/${task.id}/run`, {})
    ).json()) as { status: string; error: string };
    expect(result.status).toBe('blocked');
    expect(result.error).toContain('not currently verified free');
    expect(inferenceCalls).toBe(count);
  });
  it('rejects non-free accounts before inference', async () => {
    freeAccount = false;
    const count = inferenceCalls;
    const task = await create();
    const result = (await (
      await request(`/tasks/${task.id}/run`, {})
    ).json()) as { status: string; error: string };
    expect(result.status).toBe('blocked');
    expect(result.error).toContain('free-tier');
    expect(inferenceCalls).toBe(count);
    freeAccount = true;
  });
  it('bounds fallback to two attempts and records rate limiting without paid fallback', async () => {
    mode = 'rate';
    const count = inferenceCalls;
    const task = await create();
    const result = (await (
      await request(`/tasks/${task.id}/run`, {})
    ).json()) as { status: string; error: string };
    expect(result.status).toBe('blocked');
    expect(result.error).toContain('429');
    expect(inferenceCalls - count).toBe(2);
    mode = 'success';
    expect(
      (
        (await (await request(`/tasks/${task.id}/run`, {})).json()) as {
          status: string;
        }
      ).status,
    ).toBe('completed');
  });
  it('rejects unsafe generated files instead of claiming success', async () => {
    mode = 'invalid';
    const task = await create('website');
    const result = (await (
      await request(`/tasks/${task.id}/run`, {})
    ).json()) as { status: string; result: string | null };
    expect(result.status).toBe('failed');
    expect(result.result).toBeNull();
    mode = 'success';
  });
  it('recovers interrupted tasks rather than claiming continued execution', async () => {
    const task = await create();
    const db = await mf.getD1Database('DB');
    await db
      .prepare("UPDATE tasks SET status='running',updated=0 WHERE id=?")
      .bind(task.id)
      .run();
    const list = (await (await request('/tasks')).json()) as {
      id: string;
      status: string;
    }[];
    expect(list.find((t) => t.id === task.id)?.status).toBe('failed');
  });
  it('supports persisted source revisions and rejects invalid parents', async () => {
    const original = await create('website');
    await request(`/tasks/${original.id}/run`, {});
    const response = await request('/tasks', {
      kind: 'website',
      objective: 'Make the headings blue',
      parentId: original.id,
    });
    expect(response.status).toBe(201);
    const revision = (await response.json()) as {
      id: string;
      parent_id: string;
    };
    expect(revision.parent_id).toBe(original.id);
    expect(
      (
        (await (await request(`/tasks/${revision.id}/run`, {})).json()) as {
          status: string;
        }
      ).status,
    ).toBe('completed');
    expect(
      (
        await request('/tasks', {
          kind: 'website',
          objective: 'Modify missing source',
          parentId: 'missing',
        })
      ).status,
    ).toBe(400);
  });
  it('enforces login throttling', async () => {
    for (let i = 0; i < 4; i++)
      await request('/login', { password: 'wrong' }, false);
    expect((await request('/login', { password }, false)).status).toBe(429);
  });
  it('invalidates sessions on logout', async () => {
    expect((await request('/logout', {})).status).toBe(200);
    expect((await request('/tasks')).status).toBe(401);
  });
});
describe('Source bundle validation', () => {
  it('rejects traversal, absolute paths, duplicates, executable website paths and missing entry', () => {
    for (const files of [
      [{ path: '../x.ts', content: '' }],
      [{ path: '/x.ts', content: '' }],
      [
        { path: 'index.html', content: '' },
        { path: 'index.html', content: '' },
      ],
      [{ path: 'server.ts', content: '' }],
      [{ path: 'style.css', content: '' }],
    ]) {
      expect(() =>
        validateFiles(JSON.stringify({ summary: 'test', files }), 'website'),
      ).toThrow();
    }
  });
  it('allows React/TypeScript source export without executing it', () => {
    expect(
      validateFiles(
        '{"summary":"Source only","files":[{"path":"src/App.tsx","content":"export default function App(){}"}]}',
        'app',
      ).files,
    ).toHaveLength(1);
  });
});
