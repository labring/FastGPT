import type { z } from 'zod';

export type CliFormat = 'text' | 'json';

export type CliContext = {
  cwd: string;
  dir: string;
  format: CliFormat;
  locale: string;
  quiet: boolean;
  color: boolean;
  env: NodeJS.ProcessEnv;
  readStdin: () => Promise<string>;
};

export type CliResult = {
  changed: boolean;
  checksum?: string;
  result?: unknown;
  changes?: unknown[];
  message?: string;
  warnings?: unknown[];
};

export type CliOptionDefinition = {
  name: string;
  value: boolean;
  required?: boolean;
  description: string;
};

export type CliCommandDefinition = {
  path: readonly string[];
  introducedIn: 'PR1' | 'PR2' | 'PR3';
  kind: 'query' | 'localMutation' | 'artifact';
  inputSchema: z.ZodType;
  options: readonly CliOptionDefinition[];
  supportsDryRun: boolean;
  confirm: 'none';
  handler: (input: Record<string, unknown>, context: CliContext) => Promise<CliResult>;
};
