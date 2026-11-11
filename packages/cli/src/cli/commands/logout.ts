import type { CliCommandSpec } from '../pipeline';

export function createLogoutCommandSpec(): CliCommandSpec {
  return {
    path: ['logout'],
    aliases: ['auth logout'],
    summary: 'Revoke session (when applicable) and remove stored credentials for a profile',
    risk: 'write',
    authModes: ['none'],
    options: [
      {
        name: 'local',
        flags: '--local',
        takesValue: false,
        description: 'Only clear local credentials without calling /loginout'
      },
      {
        name: 'purge',
        flags: '--purge',
        takesValue: false,
        description: 'Remove the entire profile entry from config.json'
      }
    ],
    examples: [
      { description: 'Logout current profile', args: ['logout'] },
      {
        description: 'Remove profile completely',
        args: ['logout', '--profile', 'staging', '--purge']
      }
    ],
    execute: async ({ global, options, container }) =>
      container.authService.logout({
        global,
        local: options.local === true,
        purge: options.purge === true
      })
  };
}
