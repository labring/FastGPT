import pkg from '../../package.json';

export type CliFormat = 'text' | 'json';

export const CliExitCode = {
  success: 0,
  internal: 1,
  argument: 2,
  auth: 3,
  business: 4,
  network: 5
} as const;

export type CliExitCodeValue = (typeof CliExitCode)[keyof typeof CliExitCode];

export type AuthCredentialKind = 'token' | 'personalKey' | 'appKey';

export type CliAuthModeRequirement = AuthCredentialKind | 'none';

export type CliRiskLevel = 'read' | 'write' | 'destructive' | 'admin';

export type SecretStoreBackend = 'keychain' | 'file';

export type CliFetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GlobalCliOptions = {
  profile?: string;
  baseUrl?: string;
  token?: string;
  apiKey?: string;
  allowInsecureHttp: boolean;
  insecure: boolean;
  caCert?: string;
  format: CliFormat;
  quiet: boolean;
  color: boolean;
  fields?: readonly string[];
  pick?: string;
  raw: boolean;
};

export type CliResult<T = unknown> = {
  changed: boolean;
  data?: T;
  message?: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
};

export type CommandOptionMeta = {
  name: string;
  flags: string;
  takesValue: boolean;
  description: string;
};

export type CommandPositionalMeta = {
  name: string;
  required: boolean;
  description: string;
};

export type CommandMeta = {
  command: string;
  path: readonly string[];
  aliases: readonly string[];
  summary: string;
  risk: CliRiskLevel;
  authModes: readonly CliAuthModeRequirement[];
  positionalArgs: readonly CommandPositionalMeta[];
  options: readonly CommandOptionMeta[];
  examples: readonly { description: string; args: readonly string[] }[];
};

export function getCliVersion(): string {
  return pkg.version;
}
