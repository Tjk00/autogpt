import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parse as parseJsonc } from 'jsonc-parser';

describe('Production configuration and inactive workflow template', () => {
  it('preserves one D1 binding, API-first routing, static assets and no schedules', () => {
    const config = parseJsonc(readFileSync('wrangler.jsonc', 'utf8'));
    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases[0]).toMatchObject({
      binding: 'DB',
      database_name: 'omni',
      migrations_dir: 'migrations',
    });
    expect(config.assets).toMatchObject({
      directory: './dist',
      binding: 'ASSETS',
      run_worker_first: ['/api/*'],
    });
    expect(config.triggers).toBeUndefined();
    expect(config.vars?.LOCAL_PREVIEW).toBeUndefined();
    expect(config.observability.enabled).toBe(false);
  });
  it('is manual-only, read-only and gated on public repository and explicit free-plan authorization', () => {
    const workflow = parseYaml(
      readFileSync('deployment/manual-cloudflare.yml', 'utf8'),
    );
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.on.workflow_dispatch.inputs.authorize_deploy.default).toBe(
      false,
    );
    expect(workflow.on.workflow_dispatch.inputs.confirm_free_plan.default).toBe(
      false,
    );
    expect(workflow.jobs.deploy.if).toContain(
      'github.event.repository.private == false',
    );
    expect(workflow.jobs.deploy.if).toContain(
      'inputs.authorize_deploy && inputs.confirm_free_plan',
    );
    expect(workflow.jobs.deploy['runs-on']).toBe('ubuntu-latest');
    expect(workflow.jobs.deploy.steps[0].with.ref).toBe(
      'arena/9a131784-autogpt',
    );
  });
  it('never gives installation/build steps deployment credentials or enables preview embedding in production', () => {
    const workflow = parseYaml(
      readFileSync('deployment/manual-cloudflare.yml', 'utf8'),
    );
    const steps = workflow.jobs.deploy.steps;
    for (const step of steps.filter(
      (s: { run?: string }) =>
        s.run?.startsWith('npm ci') || s.run?.startsWith('npm run check'),
    ))
      expect(step.env).toBeUndefined();
    expect(
      steps.find(
        (s: { name?: string }) =>
          s.name === 'Deploy with platform-managed secrets',
      ).run,
    ).not.toContain('LOCAL_PREVIEW');
    const cleanup = steps.at(-1);
    expect(cleanup.if).toBe('always()');
    expect(cleanup.run).toContain('rm -f .wrangler/production-secrets.json');
  });
});
