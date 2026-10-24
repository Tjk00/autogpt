import { test, expect } from '@playwright/test';
import { staticPreview, type Bundle } from '../src/api';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
const password = process.env.OMNI_TEST_PASSWORD;
test('mobile login, real blocked execution, persistence, navigation and logout', async ({
  page,
}) => {
  if (!password)
    throw new Error(
      'Set OMNI_TEST_PASSWORD securely to the local test owner password.',
    );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Workspace password').fill(password);
  await page.getByRole('button', { name: 'Unlock workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your ideas. Put in motion.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/omni-mobile.png',
    fullPage: true,
  });
  const objective = `[Browser test ${Date.now()}] Explain the zero-spend execution guardrail.`;
  await page.getByLabel('Task objective').fill(objective);
  await page.getByRole('button', { name: 'Run task', exact: true }).click();
  await expect(
    page.getByText(
      'OpenRouter secret is not configured. No inference attempted.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry manually' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button').filter({ hasText: objective }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Execution history' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button').filter({ hasText: objective }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Provider & security configuration' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Load audit log' }).click();
  await expect(page.locator('pre')).toContainText('task.blocked');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'AI Models', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Provider & security configuration' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Test connection & load free models' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'OPENROUTER_API_KEY is not configured.',
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Workflow scheduling is not implemented',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('button', { name: 'Workspace owner Secure session' })
    .click();
  await expect(page.getByLabel('Workspace password')).toBeVisible();
  expect(errors).toEqual([]);
});
test('static preview strips active content and prevents script/network execution', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('bad.example')) requests.push(req.url());
  });
  await page.goto('/');
  const bundle: Bundle = {
    summary: 'Adversarial test fixture',
    files: [
      {
        path: 'index.html',
        content:
          '<meta http-equiv="refresh" content="0;url=https://bad.example"><script>parent.stolen=true</script><h1 onclick="alert(1)">Safe heading</h1><iframe src="https://bad.example"></iframe><img src="https://bad.example"><a href="https://bad.example">Link</a><form action="https://bad.example"><button>Send</button></form>',
      },
      { path: 'style.css', content: 'h1{color:rgb(0,128,0)}' },
    ],
  };
  const html = await page.evaluate(staticPreview, bundle);
  expect(html).not.toContain('bad.example');
  expect(html).not.toContain('onclick');
  await page.evaluate((source) => {
    const frame = document.createElement('iframe');
    frame.title = 'security test';
    frame.setAttribute('sandbox', '');
    frame.srcdoc = source;
    document.body.append(frame);
  }, html);
  const frame = page.frameLocator('iframe[title="security test"]');
  await expect(frame.getByRole('heading', { name: 'Safe heading' })).toHaveCSS(
    'color',
    'rgb(0, 128, 0)',
  );
  expect(await page.evaluate(() => 'stolen' in window)).toBe(false);
  expect(requests).toEqual([]);
});
test('project ZIP preserves nested source paths and bytes', () => {
  const files = {
    'src/App.tsx': strToU8('export default () => <h1>OMNI</h1>'),
    'README.md': strToU8('Source only — not executed'),
  };
  const roundTrip = unzipSync(zipSync(files));
  expect(Object.keys(roundTrip)).toEqual(Object.keys(files));
  expect(strFromU8(roundTrip['README.md'])).toBe('Source only — not executed');
});

test('mobile website result preview and actual ZIP download — explicit API fixtures, not live AI', async ({
  page,
}) => {
  const files = [
    { path: 'index.html', content: '<h1>Website fixture</h1>' },
    { path: 'style.css', content: 'h1{color:rgb(0,128,0)}' },
  ];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload =
      path === '/api/me'
        ? { owner: true }
        : path === '/api/providers'
          ? { openrouter: false }
          : path === '/api/tasks'
            ? [
                {
                  id: 'fixture-website',
                  kind: 'website',
                  objective: '[UI fixture] Website export',
                  model: '',
                  status: 'completed',
                  result: JSON.stringify({
                    summary: 'Explicit UI fixture, not live generation',
                    files,
                  }),
                  steps: '[]',
                  usage: null,
                  created: 1,
                  updated: 1,
                },
              ]
            : {};
    await route.fulfill({ json: payload });
  });
  await page.goto('/');
  await page
    .getByRole('button')
    .filter({ hasText: '[UI fixture] Website export' })
    .click();
  const preview = page.frameLocator(
    'iframe[title="Generated website — isolated static preview"]',
  );
  await expect(
    preview.getByRole('heading', { name: 'Website fixture' }),
  ).toHaveCSS('color', 'rgb(0, 128, 0)');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project ZIP' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('omni-fixture-website.zip');
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  const source = unzipSync(Buffer.concat(parts));
  expect(strFromU8(source['index.html'])).toBe(files[0].content);
  expect(strFromU8(source['style.css'])).toBe(files[1].content);
});
