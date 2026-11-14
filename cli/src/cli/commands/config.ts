import type { CliCommandSpec } from '../pipeline';

export function createConfigCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['config', 'list'],
      summary: 'Display CLI config path, active profile, and sanitized profile metadata',
      risk: 'read',
      authModes: ['none'],
      options: [],
      examples: [{ description: 'Show all config', args: ['config', 'list'] }],
      execute: async ({ container }) => container.profileService.listConfig()
    },
    {
      path: ['config', 'get'],
      summary: 'Read a config value (currentProfile, baseUrl, allowInsecureHttp)',
      risk: 'read',
      authModes: ['none'],
      positionalArgs: [{ name: 'key', required: true, description: 'Config key name' }],
      options: [],
      examples: [{ description: 'Get active baseUrl', args: ['config', 'get', 'baseUrl'] }],
      execute: async ({ global, positional, container }) =>
        container.profileService.getConfigValue({
          global,
          key: positional[0] ?? ''
        })
    },
    {
      path: ['config', 'set'],
      summary: 'Update a config value (currentProfile, baseUrl, allowInsecureHttp)',
      risk: 'write',
      authModes: ['none'],
      positionalArgs: [
        { name: 'key', required: true, description: 'Config key name' },
        { name: 'value', required: true, description: 'New value' }
      ],
      options: [],
      examples: [
        {
          description: 'Set baseUrl for staging profile',
          args: ['config', 'set', 'baseUrl', 'https://staging.example.com', '--profile', 'staging']
        }
      ],
      execute: async ({ global, positional, container }) =>
        container.profileService.setConfigValue({
          global,
          key: positional[0] ?? '',
          rawValue: positional[1] ?? ''
        })
    }
  ];
}
