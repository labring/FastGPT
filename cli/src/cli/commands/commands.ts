import type { CliCommandSpec } from '../pipeline';

export function createCommandsManifestCommandSpec(): CliCommandSpec {
  return {
    path: ['commands'],
    summary: 'List all registered CLI commands and their metadata for agent discovery',
    risk: 'read',
    authModes: ['none'],
    options: [],
    examples: [
      { description: 'Dump command manifest as JSON', args: ['commands', '--format', 'json'] }
    ],
    execute: async ({ commandMetas }) => ({
      changed: false,
      data: {
        commands: commandMetas
      }
    })
  };
}
