import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Code2,
  Command,
  Cpu,
  Globe,
  History,
  Layers,
  LogOut,
  Menu,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import {
  api,
  download,
  exportZip,
  staticPreview,
  type Bundle,
  type Task,
} from './api';
import './style.css';
const navigation = [
  { label: 'Command Center', icon: Command, kind: 'chat' },
  { label: 'AI Agents', icon: Cpu, kind: 'agents' },
  { label: 'Website Builder', icon: Globe, kind: 'website' },
  { label: 'App Builder', icon: Code2, kind: 'app' },
  { label: 'Money Research', icon: Search, kind: 'money' },
  { label: 'Lead Hunter', icon: Layers, kind: 'leads' },
  { label: 'Strong After 60', icon: Activity, kind: 'content' },
  { label: 'Workflows', icon: Workflow, kind: 'workflows' },
  { label: 'AI Models', icon: Cpu, kind: 'models' },
  { label: 'Integrations', icon: Zap, kind: 'integrations' },
  { label: 'History', icon: History, kind: 'history' },
  { label: 'Settings', icon: Settings, kind: 'settings' },
];
const templates = [
  {
    kind: 'website',
    icon: Globe,
    title: 'Build a website',
    text: 'From a brief to exportable source.',
    prompt:
      'Build a professional mobile-first website for a real estate company in Abuja.',
  },
  {
    kind: 'app',
    icon: Code2,
    title: 'Develop an app',
    text: 'Generate components and project files.',
    prompt:
      'Generate a React and TypeScript inventory app with local storage. Include setup instructions.',
  },
  {
    kind: 'money',
    icon: Search,
    title: 'Explore an opportunity',
    text: 'Turn a business idea into next steps.',
    prompt:
      'Suggest three B2B services I can start in Nigeria with an iPhone and zero upfront investment.',
  },
  {
    kind: 'content',
    icon: Activity,
    title: 'Create for Strong After 60',
    text: 'Plan thoughtful healthy-aging content.',
    prompt:
      'Draft a gentle balance-awareness video for Strong After 60. Mark claims requiring professional verification.',
  },
];
function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [page, setPage] = useState('chat');
  const [mobile, setMobile] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [provider, setProvider] = useState(false);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [model, setModel] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [kind, setKind] = useState('chat');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [audit, setAudit] = useState<
    { id: number; action: string; target: string; created: number }[]
  >([]);
  async function refresh() {
    const [items, providers] = await Promise.all([
      api<Task[]>('/tasks'),
      api<{ openrouter: boolean }>('/providers'),
    ]);
    setTasks(items);
    setProvider(providers.openrouter);
    setSelected((previous) =>
      previous ? items.find((t) => t.id === previous.id) || previous : null,
    );
  }
  useEffect(() => {
    api('/me')
      .then(() => setAuth(true))
      .catch(() => setAuth(false));
  }, []);
  useEffect(() => {
    if (auth) refresh().catch((e) => setError(e.message));
  }, [auth]);
  useEffect(() => {
    if (!auth || !busy) return;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [auth, busy]);
  async function action(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: string) {
    setPage(next);
    setMobile(false);
    setParentId(null);
    if (['chat', 'website', 'app', 'money', 'content'].includes(next))
      setKind(next);
  }
  async function run(task: Task) {
    const running = { ...task, status: 'running' };
    setSelected(running);
    setTasks((previous) =>
      previous.map((t) => (t.id === task.id ? running : t)),
    );
    try {
      setSelected(await api<Task>(`/tasks/${task.id}/run`, {}));
    } finally {
      await refresh();
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await action(async () => {
      const task = await api<Task>('/tasks', {
        objective,
        kind,
        model,
        parentId,
      });
      setTasks((previous) => [task, ...previous]);
      setSelected(task);
      setObjective('');
      setParentId(null);
      await run(task);
    });
  }
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const blocked = tasks.filter((t) =>
    ['blocked', 'failed'].includes(t.status),
  ).length;
  const active = tasks.filter((t) =>
    ['running', 'queued'].includes(t.status),
  ).length;
  const title =
    navigation.find((n) => n.kind === page)?.label || 'Command Center';
  if (auth === null)
    return (
      <main className="login">
        <div className="brandmark">
          <Command />
        </div>
        <p>Connecting to workspace…</p>
      </main>
    );
  if (!auth)
    return (
      <main className="login">
        <div className="login-card">
          <div className="brandmark">
            <Command />
          </div>
          <span className="eyebrow">YOUR BOUNDED AI WORKSPACE</span>
          <h1>
            Welcome to OMNI<span>.</span>
          </h1>
          <p>
            A real workspace. Explicit permissions.
            <br />
            Zero paid inference.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api('/login', { password });
                setPassword('');
                setAuth(true);
              });
            }}
          >
            <label htmlFor="password">Workspace password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={16}
              placeholder="Enter your owner password"
            />
            <button className="primary" disabled={busy}>
              Unlock workspace <ArrowUpRight size={18} />
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="notice">
            <ShieldCheck size={18} />
            <span>
              First visit? Configure the ADMIN_PASSWORD server secret. There is
              no default password or public registration.
            </span>
          </div>
        </div>
      </main>
    );
  return (
    <div className="shell">
      {mobile && (
        <button
          aria-label="Close menu"
          className="scrim"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={mobile ? 'sidebar open' : 'sidebar'}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('chat');
          }}
        >
          <div className="brandmark">
            <Command size={24} />
          </div>
          <div>
            OMNI<small>AUTOGPT GOD MODE</small>
          </div>
        </a>
        <div className="workspace">
          <span className="workspace-icon">O</span>
          <div>
            Personal workspace
            <small>Single-owner · Free-tier architecture</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navigation.map(({ label, icon: Icon, kind: key }, i) => (
            <React.Fragment key={key}>
              {i === 8 && (
                <span className="nav-label lower">CONFIGURATION</span>
              )}
              <button
                onClick={() => navigate(key)}
                className={page === key ? 'nav-item current' : 'nav-item'}
              >
                <Icon size={18} />
                <span>{label}</span>
                {key === 'chat' && <span className="nav-dot" />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="budget">
          <div>
            <ShieldCheck size={16} />
            <strong>Zero-spend guardrail</strong>
            <span className="green-dot" />
          </div>
          <p>Paid inference is disabled.</p>
          <div className="budget-track" />
          <small>$0.00 paid API budget</small>
        </div>
        <button
          className="owner"
          onClick={() =>
            action(async () => {
              await api('/logout', {});
              setAuth(false);
            })
          }
        >
          <span className="avatar">O</span>
          <div>
            Workspace owner<small>Secure session</small>
          </div>
          <LogOut size={16} />
        </button>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <span className="local-badge">
              <span className="green-dot" /> Request-driven
            </span>
            <button
              className="icon-button"
              disabled={busy}
              aria-label="Refresh backend state"
              onClick={() => action(refresh)}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar small">O</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="purple-line" /> OMNI WORKSPACE /{' '}
                {page === 'chat' ? 'OVERVIEW' : title.toUpperCase()}
              </div>
              <h1>
                {page === 'chat' ? (
                  <>
                    Your ideas. <span>Put in motion.</span>
                  </>
                ) : (
                  title
                )}
              </h1>
              <p>
                {page === 'chat'
                  ? 'One place to build, explore, and make your next move.'
                  : 'Bounded execution. Persistent results. You stay in control.'}
              </p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                navigate('chat');
                setSelected(null);
                document.getElementById('objective')?.focus();
              }}
            >
              <Plus size={16} /> New task
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stats">
            <Stat
              label="Saved tasks"
              value={tasks.length.toString()}
              detail="Latest 100 persisted records"
              icon={<Layers size={17} />}
            />
            <Stat
              label="Completed"
              value={completed.toString()}
              detail="Responses received and saved"
              icon={<Check size={17} />}
            />
            <Stat
              label="Needs attention"
              value={blocked.toString()}
              detail={`${active} queued or running`}
              icon={<Activity size={17} />}
            />
            <Stat
              label="Paid API budget"
              value="$0.00"
              detail="Only verified zero-price models"
              icon={<ShieldCheck size={17} />}
            />
          </div>
          {['chat', 'website', 'app', 'money', 'content'].includes(page) && (
            <>
              <section className="composer">
                <div className="composer-top">
                  <div className="spark-icon">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h2>
                      {page === 'chat'
                        ? 'What would you like to accomplish?'
                        : `Start a ${page === 'content' ? 'content draft' : page === 'money' ? 'business exploration' : page === 'app' ? 'source project' : 'website'}`}
                    </h2>
                    <p>
                      Describe your objective. OMNI will check access, generate,
                      and save the result.
                    </p>
                  </div>
                  <span className="tag">BOUNDED EXECUTION</span>
                </div>
                <form onSubmit={submit}>
                  {parentId && (
                    <div className="revision-note">
                      Revising saved source · Original preserved{' '}
                      <button type="button" onClick={() => setParentId(null)}>
                        Cancel revision
                      </button>
                    </div>
                  )}
                  <textarea
                    id="objective"
                    aria-label="Task objective"
                    placeholder="Describe an idea, a task, or something you want to build…"
                    maxLength={8000}
                    minLength={3}
                    required
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                  />
                  <div className="composer-bottom">
                    <div className="selects">
                      <label>
                        <Cpu size={15} />
                        <select
                          aria-label="Task type"
                          value={kind}
                          onChange={(e) => setKind(e.target.value)}
                        >
                          <option value="chat">General assistant</option>
                          <option value="website">Website builder</option>
                          <option value="app">App source builder</option>
                          <option value="money">Money research draft</option>
                          <option value="content">Strong After 60 draft</option>
                        </select>
                      </label>
                      <select
                        aria-label="Free model"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                      >
                        <option value="">Auto · free models only</option>
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="primary" disabled={busy}>
                      {busy ? 'Processing…' : 'Run task'}
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                </form>
                <div className="composer-note">
                  <ShieldCheck size={13} /> Maximum 2 inference attempts · No
                  external tools · No paid fallback
                </div>
              </section>
              {!provider && (
                <div className="notice provider-notice">
                  <Circle size={16} />
                  <span>
                    <strong>Connect a free model to begin.</strong> Tasks are
                    saved but blocked until a server-side OpenRouter key is
                    configured.
                  </span>
                  <button onClick={() => navigate('models')}>
                    Configure <ChevronRight size={14} />
                  </button>
                </div>
              )}
              <div className="section-title">
                <h2>Start with a direction</h2>
                <span>YOUR NEXT MOVE</span>
              </div>
              <div className="templates">
                {templates.map(
                  ({ kind: key, icon: Icon, title: heading, text, prompt }) => (
                    <button
                      className={`template ${key}`}
                      key={key}
                      onClick={() => {
                        navigate(key);
                        setObjective(prompt);
                      }}
                    >
                      <div className="template-top">
                        <span>
                          <Icon size={20} />
                        </span>
                        <ArrowUpRight size={16} />
                      </div>
                      <h3>{heading}</h3>
                      <p>{text}</p>
                      <small>
                        {key === 'content'
                          ? 'DRAFT ONLY'
                          : key === 'money'
                            ? 'UNVERIFIED IDEAS'
                            : key === 'app'
                              ? 'SOURCE EXPORT'
                              : 'ISOLATED STATIC PREVIEW'}
                      </small>
                    </button>
                  ),
                )}
              </div>
            </>
          )}
          {page === 'agents' && (
            <section className="panel">
              <h2>Bounded assistants</h2>
              <p>
                Each assistant uses a fixed tool policy: inference only, up to
                two attempts, no recursive execution. Plans are fixed
                application steps, not autonomous tool discovery.
              </p>
              <div className="templates">
                {templates.map((t) => (
                  <button
                    key={t.kind}
                    className="template"
                    onClick={() => {
                      navigate(t.kind);
                      setObjective(t.prompt);
                    }}
                  >
                    <t.icon />
                    <h3>{t.title}</h3>
                    <p>{t.text}</p>
                    <span>Open workspace →</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {['models', 'integrations', 'settings'].includes(page) && (
            <section className="panel">
              <div className="section-title">
                <h2>Provider & security configuration</h2>
                <span
                  className={provider ? 'status completed' : 'status blocked'}
                >
                  {provider
                    ? 'Key configured · connection untested'
                    : 'Not connected'}
                </span>
              </div>
              <p>
                Credentials are Worker secrets, never browser storage. This
                milestone supports OpenRouter only. A live catalog check rejects
                models without zero pricing across all reported price fields.
              </p>
              <div className="notice">
                <ShieldCheck />
                <span>
                  Paid budget: <strong>$0.00</strong>. Use a dedicated
                  zero-credit provider account, set its spending limit to zero
                  where available, and do not enable auto-top-up. Free
                  availability and quotas are not guaranteed.
                </span>
              </div>
              <ol className="setup">
                <li>
                  Create a free provider account and an API key outside this
                  application.
                </li>
                <li>
                  In this application's directory, run{' '}
                  <code>npx wrangler secret put OPENROUTER_API_KEY</code>. For
                  local use, add it to the ignored <code>.dev.vars</code> file.
                </li>
                <li>
                  Configure <code>ADMIN_PASSWORD</code> as a server secret (16+
                  characters). Sessions expire after 24 hours.
                </li>
                <li>
                  Test catalog access below. This makes a real network request
                  but does not invoke inference.
                </li>
              </ol>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const data = await api<{
                      models: { id: string; name: string }[];
                    }>('/models');
                    setModels(data.models);
                    if (!data.models.length)
                      throw new Error('No verified free models available.');
                  })
                }
              >
                <RefreshCw size={16} /> Test connection & load free models
              </button>
              {models.length > 0 && (
                <div className="model-list">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      className={model === m.id ? 'model selected' : 'model'}
                      onClick={() => setModel(m.id)}
                    >
                      <Cpu size={17} />
                      <div>
                        <strong>{m.name}</strong>
                        <small>{m.id}</small>
                      </div>
                      <span>Verified $0</span>
                    </button>
                  ))}
                </div>
              )}
              <h3>Other providers & integrations</h3>
              <p>
                Gemini, Groq, Hugging Face, arbitrary compatible endpoints,
                GitHub export commits, video generation and Buffer publishing
                are <strong>not implemented</strong>. No external publishing is
                authorized or performed.
              </p>
              <h3>Storage & limits</h3>
              <p>
                D1 stores objectives, responses, sessions, and audit events.
                Avoid entering sensitive information. Login is limited to 5
                attempts per 15 minutes per IP; task creation and runs to 20
                each per hour. Only the latest 100 tasks are displayed. No
                continuous background execution or scheduled workflows.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const events = await api<typeof audit>('/audit');
                    setAudit(events);
                  })
                }
              >
                <History size={16} /> Load audit log
              </button>
              {audit.length > 0 && (
                <pre>
                  {audit
                    .map(
                      (e) =>
                        `${new Date(e.created).toISOString()} ${e.action} ${e.target}`,
                    )
                    .join('\n')}
                </pre>
              )}
            </section>
          )}
          {['leads', 'workflows'].includes(page) && (
            <section className="panel empty-state">
              <Workflow size={32} />
              <h2>
                {page === 'leads'
                  ? 'Public lead research is not connected'
                  : 'Workflow scheduling is not implemented'}
              </h2>
              <p>
                {page === 'leads'
                  ? 'No authorized search API is configured. OMNI does not invent prospects, scrape private information, or send unsolicited messages.'
                  : 'Tasks run only while an authenticated request is executing. There is no scheduler, conditional workflow engine, or background worker in this milestone.'}
              </p>
              <span className="status blocked">NOT IMPLEMENTED</span>
              <button className="secondary" onClick={() => navigate('chat')}>
                Back to working task execution
              </button>
            </section>
          )}
          {selected && (
            <Result
              task={selected}
              busy={busy}
              close={() => setSelected(null)}
              retry={() => action(() => run(selected))}
              onError={setError}
              revise={() => {
                navigate(selected.kind);
                setParentId(selected.id);
                setObjective('Revise the existing project: ');
                setSelected(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
          {![
            'models',
            'settings',
            'integrations',
            'leads',
            'workflows',
          ].includes(page) && (
            <section className="panel activity-panel">
              <div className="section-title">
                <h2>
                  {page === 'history' ? 'Execution history' : 'Recent activity'}{' '}
                  <span className="count">{tasks.length}</span>
                </h2>
                <button
                  className="text-button"
                  onClick={() =>
                    page === 'history'
                      ? download(
                          'omni-history.json',
                          JSON.stringify(tasks, null, 2),
                        )
                      : navigate('history')
                  }
                >
                  {page === 'history' ? 'Export history' : 'View history'}
                  <ArrowUpRight size={14} />
                </button>
              </div>
              {tasks.length === 0 ? (
                <div className="empty-state">
                  <MessageSquare size={26} />
                  <h3>Your workspace starts here</h3>
                  <p>
                    No executions yet. Submit a task to create the first real
                    record.
                  </p>
                </div>
              ) : (
                <div className="task-list">
                  {tasks.slice(0, page === 'history' ? 100 : 5).map((task) => (
                    <button
                      className="task-row"
                      key={task.id}
                      onClick={() => setSelected(task)}
                    >
                      <span className="task-icon">
                        <Code2 size={17} />
                      </span>
                      <div>
                        <strong>{task.objective}</strong>
                        <small>
                          {task.kind} ·{' '}
                          {new Date(task.created).toLocaleString()}
                        </small>
                      </div>
                      <span className={`status ${task.status}`}>
                        {task.status}
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} /> Built for control, not unlimited
              autonomy.
            </span>
            <span>OMNI / FOUNDATION v0.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div>
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Result({
  task,
  busy,
  close,
  retry,
  onError,
  revise,
}: {
  task: Task;
  busy: boolean;
  close: () => void;
  retry: () => void;
  onError: (message: string) => void;
  revise: () => void;
}) {
  let bundle: Bundle | null = null;
  if (task.result && ['website', 'app'].includes(task.kind)) {
    try {
      bundle = JSON.parse(task.result);
    } catch {
      /* Non-bundle responses remain plain text. */
    }
  }
  const steps = JSON.parse(task.steps) as { step: string; time: number }[];
  return (
    <section className="panel result">
      <div className="section-title">
        <h2>Execution result</h2>
        <div className="result-actions">
          <span className={`status ${task.status}`} aria-live="polite">
            {task.status}
          </span>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close result"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <p className="result-objective">{task.objective}</p>
      {task.error && <div className="error">{task.error}</div>}
      {task.status === 'running' && (
        <p role="status">
          Waiting for the bounded execution request. This is not a continuous
          background process.
        </p>
      )}
      {steps.length > 0 && (
        <details open={task.status !== 'completed'}>
          <summary>Execution steps ({steps.length})</summary>
          <ol className="steps">
            {steps.map((step, i) => (
              <li key={i}>
                <time>{new Date(step.time).toLocaleTimeString()}</time>
                {step.step}
              </li>
            ))}
          </ol>
        </details>
      )}
      {task.result && (
        <>
          <div className="result-toolbar">
            <button
              className="secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(task.result!)
                  .catch(() =>
                    onError(
                      'Clipboard unavailable. Use the download action instead.',
                    ),
                  )
              }
            >
              Copy result
            </button>
            <button
              className="secondary"
              onClick={() =>
                download(
                  `omni-${task.id}.${bundle ? 'json' : 'txt'}`,
                  task.result!,
                  bundle ? 'application/json' : 'text/plain',
                )
              }
            >
              <ArrowDownToLine size={15} />{' '}
              {bundle ? 'Export source bundle' : 'Download response'}
            </button>
          </div>
          {bundle ? (
            <>
              <div className="result-toolbar">
                <button
                  className="primary"
                  onClick={() => exportZip(bundle!, task.id)}
                >
                  <ArrowDownToLine size={15} /> Download project ZIP
                </button>
                <button className="secondary" disabled={busy} onClick={revise}>
                  Revise this source
                </button>
              </div>
              <p>{bundle.summary}</p>
              <p className="muted">
                Source bundle JSON contains every generated file. Download
                individual files below. Build and runtime correctness are not
                verified.
              </p>
              {task.kind === 'website' && (
                <>
                  <h3>Isolated static preview</h3>
                  <p className="muted">
                    Scripts, network requests, forms and navigation permissions
                    are disabled. JavaScript is included in exports only.
                  </p>
                  <iframe
                    title="Generated website — isolated static preview"
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={staticPreview(bundle)}
                  />
                </>
              )}
              {bundle.files.map((file) => (
                <details key={file.path}>
                  <summary>{file.path}</summary>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        file.path.split('/').pop()!,
                        file.content,
                        'text/plain',
                      )
                    }
                  >
                    Download file
                  </button>
                  <pre>{file.content}</pre>
                </details>
              ))}
            </>
          ) : (
            <pre className="response-text">{task.result}</pre>
          )}
          {task.usage && (
            <details>
              <summary>Provider-reported usage & zero-price estimate</summary>
              <pre>{JSON.stringify(JSON.parse(task.usage), null, 2)}</pre>
            </details>
          )}
        </>
      )}
      {['blocked', 'failed', 'queued'].includes(task.status) && (
        <button className="secondary" disabled={busy} onClick={retry}>
          <Play size={15} />{' '}
          {task.status === 'queued' ? 'Run saved task' : 'Retry manually'}
        </button>
      )}
    </section>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
