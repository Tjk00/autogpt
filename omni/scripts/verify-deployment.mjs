const base = new URL(process.env.OMNI_URL || '');
const local = ['localhost', '127.0.0.1'].includes(base.hostname);
if (
  base.protocol !== 'https:' &&
  !(local && process.env.OMNI_VERIFY_LOCAL === 'true')
) {
  throw new Error(
    'Verification requires HTTPS. Local HTTP requires explicit OMNI_VERIFY_LOCAL=true.',
  );
}
const password = process.env.OMNI_ADMIN_PASSWORD;
if (!password || password.length < 16)
  throw new Error(
    'Supply OMNI_ADMIN_PASSWORD securely through the environment.',
  );
const runAI = process.env.OMNI_VERIFY_FREE_AI === 'true';
let cookie = '';
async function request(path, data, authenticated = false) {
  const response = await fetch(`${base.origin}/api${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(data === undefined
        ? {}
        : { Origin: base.origin, 'Content-Type': 'application/json' }),
      ...(authenticated ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: 'error',
    signal: AbortSignal.timeout(65000),
  });
  return response;
}
async function expectJson(response, expected = 200) {
  if (response.status !== expected)
    throw new Error(
      `Verification failed: expected HTTP ${expected}, received ${response.status}. Inspect server configuration; credentials are not printed.`,
    );
  return response.json();
}
const health = await expectJson(await request('/health'));
if (
  !health.ok ||
  health.database !== 'connected' ||
  health.authentication !== 'configured'
)
  throw new Error('Database or owner authentication is not configured.');
if (!local) {
  const homepage = await fetch(base.origin, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (
    !homepage.ok ||
    homepage.headers.get('x-frame-options') !== 'DENY' ||
    !homepage.headers
      .get('content-security-policy')
      ?.includes("frame-ancestors 'none'")
  )
    throw new Error(
      'Production asset response or anti-framing protection is missing. Remove LOCAL_PREVIEW remotely.',
    );
}
await expectJson(await request('/tasks'), 401);
const login = await request('/login', { password });
await expectJson(login);
const session = login.headers.get('set-cookie') || '';
for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict'])
  if (!session.includes(attribute))
    throw new Error('Missing session security attribute.');
cookie = session.split(';')[0];
const report = {
  origin: base.origin,
  local,
  health: 'WORKING',
  unauthenticatedRoutes: 'WORKING',
  login: 'WORKING',
};
try {
  await expectJson(await request('/me', undefined, true));
  const provider = await expectJson(
    await request('/providers', undefined, true),
  );
  report.providerKey = provider.openrouter
    ? 'configured, live connection not yet verified'
    : 'BLOCKED: no server key';
  const task = await expectJson(
    await request(
      '/tasks',
      {
        kind: 'chat',
        objective:
          'Generate three professional website headlines for a cleaning company.',
        model: '',
      },
      true,
    ),
    201,
  );
  let execution = task;
  if (!provider.openrouter || runAI)
    execution = await expectJson(
      await request(`/tasks/${task.id}/run`, {}, true),
    );
  const history = await expectJson(await request('/tasks', undefined, true));
  const persisted = history.find((item) => item.id === task.id);
  if (!persisted || persisted.status !== execution.status)
    throw new Error('Task persistence verification failed.');
  report.persistence = 'WORKING';
  report.taskId = task.id;
  report.taskStatus = execution.status;
  report.executionLogs = JSON.parse(persisted.steps);
  report.taskError = persisted.error;
  report.realAI = !provider.openrouter
    ? 'BLOCKED'
    : !runAI
      ? 'NOT REQUESTED: explicit OMNI_VERIFY_FREE_AI=true required'
      : execution.status === 'completed'
        ? 'WORKING'
        : 'BLOCKED';
  if (runAI) {
    if (execution.status !== 'completed')
      throw new Error(
        'Real AI task did not complete. Inspect saved task history.',
      );
    const usage = JSON.parse(execution.usage || '{}');
    report.providerReportedCostUsd = usage.cost ?? null;
    report.zeroCostEvidence =
      usage.cost === 0
        ? 'Provider reports zero for this response; independent billing ledger not verified'
        : 'BLOCKED: provider did not report an exact zero cost';
    report.result = execution.result;
    if (usage.cost !== 0)
      throw new Error(
        'Cannot verify zero provider-reported cost. Do not claim zero paid charges.',
      );
  }
} finally {
  await expectJson(await request('/logout', {}, true));
  await expectJson(await request('/tasks', undefined, true), 401);
  report.logout = 'WORKING';
  console.log(JSON.stringify(report, null, 2));
}
