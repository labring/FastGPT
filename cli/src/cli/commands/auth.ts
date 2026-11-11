import { CliArgumentError } from '../../shared/errors';
import type { CliCommandSpec } from '../pipeline';

export function createAuthCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['auth', 'status'],
      summary: 'Show active profile, credential source, storage backend, and optional live check',
      risk: 'read',
      authModes: ['none'],
      options: [
        {
          name: 'verify',
          flags: '--verify',
          takesValue: false,
          description: 'Verify active credential against the server'
        }
      ],
      examples: [
        { description: 'Check local auth status', args: ['auth', 'status'] },
        {
          description: 'Check local auth status with live server probe',
          args: ['auth', 'status', '--verify']
        }
      ],
      execute: async ({ global, options, container }) =>
        container.authService.getStatus({
          global,
          verify: options.verify === true
        })
    },
    {
      path: ['auth', 'list'],
      summary: 'List all configured CLI profiles',
      risk: 'read',
      authModes: ['none'],
      options: [],
      examples: [{ description: 'List profiles', args: ['auth', 'list'] }],
      execute: async ({ container }) => container.profileService.listProfiles()
    },
    {
      path: ['auth', 'switch'],
      summary: 'Switch the default active CLI profile',
      risk: 'write',
      authModes: ['none'],
      positionalArgs: [{ name: 'profile', required: false, description: 'Target profile name' }],
      options: [],
      examples: [{ description: 'Switch active profile', args: ['auth', 'switch', 'prod'] }],
      execute: async ({ global, positional, container }) =>
        container.profileService.switchProfile({
          targetName: positional[0] ?? global.profile
        })
    },
    {
      path: ['auth', 'switch-team'],
      summary: 'Switch active team for the current session (Pro edition only)',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [{ name: 'teamId', required: false, description: 'Target team ObjectId' }],
      options: [
        {
          name: 'teamId',
          flags: '--team-id <teamId>',
          takesValue: true,
          description: 'Target team ObjectId'
        }
      ],
      examples: [
        {
          description: 'Switch session team',
          args: ['auth', 'switch-team', '68ad85a7463006c963799a06']
        }
      ],
      execute: async ({ global, options, positional, resolvedAuth, container }) => {
        const teamId = positional[0] ?? (typeof options.teamId === 'string' ? options.teamId : '');
        if (!teamId.trim()) {
          throw new CliArgumentError(
            'Team ID is required.',
            undefined,
            'Usage: fastgpt auth switch-team <teamId>'
          );
        }
        return container.authService.switchTeam({
          global,
          resolved: resolvedAuth!,
          teamId
        });
      }
    }
  ];
}
