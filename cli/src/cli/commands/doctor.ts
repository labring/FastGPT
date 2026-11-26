import type { CliCommandSpec } from '../pipeline';

export function createDoctorCommandSpec(): CliCommandSpec {
  return {
    path: ['doctor'],
    summary:
      'Diagnose CLI runtime, config security, server reachability, auth status, and capability matrix',
    risk: 'read',
    authModes: ['none'],
    options: [],
    examples: [{ description: 'Run diagnostics', args: ['doctor'] }],
    execute: async ({ global, container }) => container.doctorService.runDiagnostics({ global })
  };
}
