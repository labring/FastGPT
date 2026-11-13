import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run';
import { createCommandRegistry, getCliCommandSpecs } from '../../src/cli/registry';

describe('CommandRegistry (src/cli/registry.ts)', () => {
  it('instantiates registry and indexes specs by path', () => {
    const registry = createCommandRegistry();
    const specs = registry.getAllSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(11);

    const whoami = registry.findByPath(['whoami']);
    expect(whoami?.summary).toContain('Show the active authenticated identity');

    const authStatus = registry.findByPath(['auth', 'status']);
    expect(authStatus?.risk).toBe('read');

    expect(registry.findByPath(['non', 'existent'])).toBeUndefined();
  });

  it('filters commands by risk level (essential for mcp serve read-only sandbox)', () => {
    const registry = createCommandRegistry();
    const readOnly = registry.filterByRisk(['read']);
    expect(readOnly.every((cmd) => cmd.risk === 'read')).toBe(true);
    expect(readOnly.some((cmd) => cmd.path[0] === 'whoami')).toBe(true);

    const writes = registry.filterByRisk(['write', 'destructive']);
    expect(writes.some((cmd) => cmd.path[0] === 'login')).toBe(true);
  });

  it('filters commands by authMode requirement', () => {
    const registry = createCommandRegistry();
    const unauthenticated = registry.filterByAuthMode('none');
    expect(unauthenticated.some((cmd) => cmd.path[0] === 'login')).toBe(true);
    expect(unauthenticated.some((cmd) => cmd.path[0] === 'config')).toBe(true);

    const tokenOnly = registry.filterByAuthMode('token');
    expect(tokenOnly.some((cmd) => cmd.path.join(' ') === 'auth switch-team')).toBe(true);
  });

  it('generates consistent CommandMeta items', () => {
    const registry = createCommandRegistry();
    const metas = registry.getMetas();
    expect(metas.length).toBe(getCliCommandSpecs().length);
    expect(metas[0]).toHaveProperty('command');
    expect(metas[0]).toHaveProperty('path');
    expect(metas[0]).toHaveProperty('risk');
    expect(metas[0]).toHaveProperty('authModes');
  });

  it('supports filtering commands manifest by --domain and --risk for agent discovery', async () => {
    const out: string[] = [];
    const code = await runCli({
      argv: ['commands', '--domain', 'dataset', '--risk', 'read', '--format', 'json'],
      isTTY: false,
      stdout: (line) => out.push(line),
      stderr: () => {}
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.cliVersion).toBeTruthy();
    expect(parsed.meta.total).toBe(parsed.data.commands.length);
    expect(parsed.data.commands.length).toBeGreaterThan(10);
    expect(
      parsed.data.commands.every(
        (cmd: { command: string; risk: string }) =>
          cmd.command.startsWith('dataset') && cmd.risk === 'read'
      )
    ).toBe(true);
  });

  it('supports --compact and --command single-command lookup with self-healing hint on typo', async () => {
    const compactOut: string[] = [];
    const compactCode = await runCli({
      argv: ['commands', '--compact', '--format', 'json'],
      isTTY: false,
      stdout: (line) => compactOut.push(line),
      stderr: () => {}
    });
    expect(compactCode).toBe(0);
    const compactJson = JSON.parse(compactOut.join('\n'));
    expect(compactJson.meta.compact).toBe(true);
    expect(compactJson.data.commands[0]).toHaveProperty('usage');
    expect(compactJson.data.commands[0]).not.toHaveProperty('examples');

    const singleOut: string[] = [];
    const singleCode = await runCli({
      argv: ['commands', '--command', 'dataset collection create-file', '--format', 'json'],
      isTTY: false,
      stdout: (line) => singleOut.push(line),
      stderr: () => {}
    });
    expect(singleCode).toBe(0);
    const singleJson = JSON.parse(singleOut.join('\n'));
    expect(singleJson.data.command.command).toBe('dataset collection create-file');
    expect(singleJson.data.command.options.length).toBeGreaterThan(3);

    const errOut: string[] = [];
    const errCode = await runCli({
      argv: ['commands', '--command', 'dataset collection', '--format', 'json'],
      isTTY: false,
      stdout: () => {},
      stderr: (line) => errOut.push(line)
    });
    expect(errCode).toBe(2);
    const errJson = JSON.parse(errOut.join('\n'));
    expect(errJson.error.hint).toContain('Did you mean:');
  });
});
