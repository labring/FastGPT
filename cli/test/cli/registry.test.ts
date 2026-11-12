import { describe, expect, it } from 'vitest';
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
});
