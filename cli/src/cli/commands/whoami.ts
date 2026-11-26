import type { CliCommandSpec } from '../pipeline';

export function createWhoamiCommandSpec(): CliCommandSpec {
  return {
    path: ['whoami'],
    summary: 'Show the active authenticated identity, team context, permissions, and quota',
    risk: 'read',
    authModes: ['token', 'personalKey', 'appKey'],
    options: [
      {
        name: 'noCacheUpdate',
        flags: '--no-cache-update',
        takesValue: false,
        description: 'Do not refresh cached profile metadata from server response'
      }
    ],
    examples: [
      { description: 'Inspect current identity', args: ['whoami'] },
      { description: 'Inspect identity as JSON for CI/Agent', args: ['whoami', '--format', 'json'] }
    ],
    execute: async ({ global, options, resolvedAuth, container }) =>
      container.authService.whoami({
        global,
        resolved: resolvedAuth!,
        noCacheUpdate: options.cacheUpdate === false
      })
  };
}
