import {
  BudgetViolationError,
  freeModels,
  verifyFreeAccount,
  inference,
  kinds,
  validateFiles,
  type Kind,
} from './ai';
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  LOCAL_PREVIEW?: string;
  ADMIN_PASSWORD?: string;
  OPENROUTER_API_KEY?: string;
}
interface Task {
  id: string;
  kind: Kind;
  objective: string;
  model: string;
  parent_id: string | null;
  status: string;
  result: string | null;
  error: string | null;
  steps: string;
  usage: string | null;
  created: number;
  updated: number;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(value, { status, headers });
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const audit = (env: Env, action: string, target = '') =>
  env.DB.prepare('INSERT INTO audit (action,target,created) VALUES (?,?,?)')
    .bind(action, target, Date.now())
    .run();
async function rate(env: Env, key: string, limit: number, seconds: number) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const result = await env.DB.prepare(
    'INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
  )
    .bind(`${key}:${bucket}`, Date.now() + seconds * 1000)
    .first<{ count: number }>();
  if (!result || result.count > limit)
    throw new HttpError(
      429,
      'Rate limit reached. Try again after the current window.',
    );
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'Expected application/json');
  if (Number(request.headers.get('content-length')) > 16000)
    throw new HttpError(413, 'Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 16000) {
      await reader.cancel();
      throw new HttpError(413, 'Request too large');
    }
    chunks.push(part.value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(buffer));
    if (!value || Array.isArray(value) || typeof value !== 'object')
      throw new Error();
    return value;
  } catch {
    throw new HttpError(400, 'Invalid JSON object');
  }
}
async function session(request: Request, env: Env) {
  const token = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)omni_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) throw new HttpError(401, 'Sign in required');
  const hash = await digest(token);
  if (
    !(await env.DB.prepare(
      'SELECT token_hash FROM sessions WHERE token_hash=? AND expires>?',
    )
      .bind(hash, Date.now())
      .first())
  )
    throw new HttpError(401, 'Session expired');
  return hash;
}
async function execute(env: Env, task: Task) {
  const claim = await env.DB.prepare(
    "UPDATE tasks SET status='running',error=NULL,updated=? WHERE id=? AND status IN ('queued','blocked','failed')",
  )
    .bind(Date.now(), task.id)
    .run();
  if (!claim.meta.changes)
    throw new HttpError(409, 'Task is already running or completed');
  const steps: { step: string; time: number }[] = [];
  const log = async (step: string) => {
    steps.push({ step, time: Date.now() });
    await env.DB.prepare('UPDATE tasks SET steps=?,updated=? WHERE id=?')
      .bind(JSON.stringify(steps), Date.now(), task.id)
      .run();
  };
  let state = 'blocked';
  try {
    await log(
      'Validated objective. Plan: check free model → generate bounded response → validate output → save. Tools: inference only; no browsing, shell or publishing.',
    );
    if (!env.OPENROUTER_API_KEY)
      throw new Error(
        'OpenRouter secret is not configured. No inference attempted.',
      );
    let objective = task.objective;
    if (task.parent_id) {
      const parent = await env.DB.prepare(
        "SELECT result FROM tasks WHERE id=? AND status='completed' AND kind=?",
      )
        .bind(task.parent_id, task.kind)
        .first<{ result: string }>();
      if (!parent?.result || parent.result.length > 80000)
        throw new Error(
          'Revision source is unavailable or exceeds the 80,000 character revision limit.',
        );
      objective = `Revise this existing source bundle according to the instruction. Return the complete updated bundle.\nSOURCE:\n${parent.result}\nINSTRUCTION:\n${task.objective}`;
      await log(
        'Loaded previous source bundle for revision. Original files are preserved in history.',
      );
    }
    await verifyFreeAccount(env.OPENROUTER_API_KEY);
    const models = await freeModels(env.OPENROUTER_API_KEY);
    const requested = models.find((m) => m.id === task.model);
    if (task.model && !requested)
      throw new Error(
        'Selected model is not currently verified free. No inference attempted.',
      );
    const candidates = requested
      ? [requested, ...models.filter((m) => m.id !== requested.id)].slice(0, 2)
      : models.slice(0, 2);
    if (!candidates.length)
      throw new Error('No verified zero-price :free models available.');
    let output: Awaited<ReturnType<typeof inference>> | undefined;
    let lastError: unknown;
    for (const model of candidates) {
      await log(
        `Attempt ${candidates.indexOf(model) + 1}/2: ${model.id}. Maximum 3,500 output tokens; 20-second timeout.`,
      );
      try {
        output = await inference(
          env.OPENROUTER_API_KEY,
          model.id,
          task.kind,
          objective,
        );
        break;
      } catch (error) {
        if (error instanceof BudgetViolationError) throw error;
        lastError = error;
        await log(
          error instanceof Error ? error.message : 'Provider request failed',
        );
      }
    }
    if (!output) throw lastError ?? new Error('Free inference unavailable');
    state = 'failed';
    const result =
      task.kind === 'website' || task.kind === 'app'
        ? JSON.stringify(validateFiles(output.text, task.kind))
        : output.text;
    await log(
      task.kind === 'website' || task.kind === 'app'
        ? 'Source structure and paths validated. Runtime, correctness and security are not verified.'
        : 'Response received. Factual claims are not independently verified.',
    );
    await env.DB.prepare(
      "UPDATE tasks SET status='completed',result=?,usage=?,updated=? WHERE id=?",
    )
      .bind(result, JSON.stringify(output.usage), Date.now(), task.id)
      .run();
    await audit(env, 'task.completed', task.id);
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Provider timed out. Retry manually later.'
        : error instanceof Error
          ? error.message
          : 'Execution failed';
    await env.DB.prepare(
      'UPDATE tasks SET status=?,error=?,updated=? WHERE id=?',
    )
      .bind(state, message.slice(0, 1000), Date.now(), task.id)
      .run();
    await audit(env, `task.${state}`, task.id);
  }
  return env.DB.prepare('SELECT * FROM tasks WHERE id=?')
    .bind(task.id)
    .first<Task>();
}
async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!['GET', 'POST'].includes(request.method))
    throw new HttpError(405, 'Method not allowed');
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin)
    throw new HttpError(403, 'Same-origin requests required');
  if (path === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1').first();
    return json({
      ok: true,
      database: 'connected',
      authentication:
        env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 16
          ? 'configured'
          : 'setup_required',
    });
  }
  if (path === '/api/login' && request.method === 'POST') {
    await rate(
      env,
      `login:${request.headers.get('cf-connecting-ip') || 'local'}`,
      5,
      900,
    );
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16)
      throw new HttpError(
        503,
        'Owner must configure ADMIN_PASSWORD (at least 16 characters) as a Worker secret.',
      );
    const input = await body(request);
    const provided = await digest(
      typeof input.password === 'string' ? input.password : '',
    );
    const expected = await digest(env.ADMIN_PASSWORD);
    let difference = 0;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    if (difference) {
      await audit(env, 'login.failed');
      throw new HttpError(401, 'Invalid password');
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    await env.DB.prepare(
      'INSERT INTO sessions (token_hash,expires) VALUES (?,?)',
    )
      .bind(await digest(token), Date.now() + 86400000)
      .run();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(
        Date.now(),
      ),
      env.DB.prepare('DELETE FROM audit WHERE created<?').bind(
        Date.now() - 30 * 86400000,
      ),
    ]);
    await audit(env, 'login.success');
    return json({ ok: true }, 200, {
      'Set-Cookie': `omni_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
    });
  }
  const hash = await session(request, env);
  if (path === '/api/me' && request.method === 'GET')
    return json({ owner: true });
  if (path === '/api/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
      .bind(hash)
      .run();
    return json({ ok: true }, 200, {
      'Set-Cookie':
        'omni_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    });
  }
  if (path === '/api/providers' && request.method === 'GET')
    return json({
      openrouter: Boolean(env.OPENROUTER_API_KEY),
      paid_budget_usd: 0,
      other_providers:
        'Not enabled: cannot verify account-level free entitlement.',
    });
  if (path === '/api/models' && request.method === 'GET') {
    await rate(env, 'models', 20, 3600);
    if (!env.OPENROUTER_API_KEY)
      throw new HttpError(503, 'OPENROUTER_API_KEY is not configured.');
    await verifyFreeAccount(env.OPENROUTER_API_KEY);
    return json({ models: await freeModels(env.OPENROUTER_API_KEY) });
  }
  if (path === '/api/audit' && request.method === 'GET')
    return json(
      (
        await env.DB.prepare(
          'SELECT * FROM audit ORDER BY id DESC LIMIT 100',
        ).all()
      ).results,
    );
  if (path === '/api/tasks' && request.method === 'GET') {
    await env.DB.prepare(
      "UPDATE tasks SET status='failed',error='Request interrupted or exceeded runtime. Retry manually.',updated=? WHERE status='running' AND updated<?",
    )
      .bind(Date.now(), Date.now() - 90000)
      .run();
    return json(
      (
        await env.DB.prepare(
          'SELECT * FROM tasks ORDER BY created DESC LIMIT 100',
        ).all()
      ).results,
    );
  }
  if (path === '/api/tasks' && request.method === 'POST') {
    await rate(env, 'tasks', 20, 3600);
    const input = await body(request);
    if (
      typeof input.objective !== 'string' ||
      input.objective.trim().length < 3 ||
      input.objective.length > 8000 ||
      !kinds.includes(input.kind as Kind)
    )
      throw new HttpError(
        400,
        'Choose a supported task type and an objective between 3 and 8,000 characters.',
      );
    if (
      input.model !== undefined &&
      (typeof input.model !== 'string' || input.model.length > 200)
    )
      throw new HttpError(400, 'Invalid model');
    if (input.parentId !== undefined && input.parentId !== null) {
      if (
        typeof input.parentId !== 'string' ||
        !['website', 'app'].includes(String(input.kind))
      )
        throw new HttpError(400, 'Invalid revision');
      if (
        !(await env.DB.prepare(
          "SELECT id FROM tasks WHERE id=? AND kind=? AND status='completed'",
        )
          .bind(input.parentId, input.kind)
          .first())
      )
        throw new HttpError(400, 'Completed source task not found');
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO tasks (id,kind,objective,model,status,created,updated,parent_id) VALUES (?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        input.kind,
        input.objective.trim(),
        input.model || '',
        'queued',
        now,
        now,
        input.parentId || null,
      )
      .run();
    await audit(env, 'task.created', id);
    return json(
      await env.DB.prepare('SELECT * FROM tasks WHERE id=?').bind(id).first(),
      201,
    );
  }
  const run = path.match(/^\/api\/tasks\/([a-f0-9-]{36})\/run$/);
  if (run && request.method === 'POST') {
    await rate(env, 'runs', 20, 3600);
    const task = await env.DB.prepare('SELECT * FROM tasks WHERE id=?')
      .bind(run[1])
      .first<Task>();
    if (!task) throw new HttpError(404, 'Task not found');
    return json(await execute(env, task));
  }
  throw new HttpError(404, 'Route not found');
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = new URL(request.url).pathname.startsWith('/api/')
        ? await api(request, env)
        : await env.ASSETS.fetch(request);
    } catch (error) {
      response = json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : 'Service unavailable. Check database bindings and server configuration.',
        },
        error instanceof HttpError ? error.status : 503,
      );
    }
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    if (env.LOCAL_PREVIEW !== 'true') headers.set('X-Frame-Options', 'DENY');
    headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (new URL(request.url).pathname.startsWith('/api/'))
      headers.set('Cache-Control', 'no-store');
    else
      headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; ${env.LOCAL_PREVIEW === 'true' ? '' : "frame-ancestors 'none'"}`,
      );
    return new Response(response.body, { status: response.status, headers });
  },
};
