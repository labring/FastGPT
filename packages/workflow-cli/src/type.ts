import type { z } from 'zod';
import type { WorkflowTemplateProvider } from '@fastgpt/workflow-core';

export type CliFormat = 'text' | 'json';

export type CliContext = {
  readonly cwd: string;
  readonly dir: string;
  readonly format: CliFormat;
  readonly locale: string;
  readonly quiet: boolean;
  readonly color: boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly isTTY: boolean;
  readonly readStdin: () => Promise<string>;
  readonly requestConfirmation: (targetChecksum: string) => Promise<boolean>;
  readonly templateProvider: WorkflowTemplateProvider;
};

export type ParsedCliContext = Omit<CliContext, 'templateProvider'>;

export type CliAuditEvent = {
  command: string;
  appId?: string;
  baseChecksum?: string;
  targetChecksum?: string;
  changedNodeIds?: string[];
  changedEdgeCount?: number;
  durationMs: number;
  result: 'success' | 'rejected' | 'conflict' | 'failed';
};

export type CliResult = {
  changed: boolean;
  checksum?: string;
  result?: unknown;
  changes?: unknown[];
  message?: string;
  warnings?: unknown[];
  audit?: CliAuditEvent;
};

export type CliOptionDefinition = {
  name: string;
  value: boolean;
  required?: boolean;
  description: string;
};

export type CliCommandDefinition = {
  path: readonly string[];
  introducedIn: 'PR1' | 'PR2' | 'PR3' | 'PR4';
  kind: 'query' | 'localMutation' | 'artifact';
  inputSchema: z.ZodType;
  options: readonly CliOptionDefinition[];
  supportsDryRun: boolean;
  confirm: 'none' | 'checksum';
  handler: (input: Record<string, unknown>, context: CliContext) => Promise<CliResult>;
};
