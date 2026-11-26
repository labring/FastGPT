export declare const PRIVATE_DAL_REPO_ALIAS_RE: RegExp;

export declare const isBlockedPrivateDalRepoImport: (params: {
  source: string;
  importer?: string;
}) => boolean;

export type BlockedPrivateDalImportLocation = {
  start: { line: number; column: number };
  end: { line: number; column: number };
};

export type BlockedPrivateDalImportViolation = {
  specifier: string;
  loc: BlockedPrivateDalImportLocation;
};

export declare const findBlockedPrivateDalImportsInSource: (params: {
  filePath: string;
  content: string;
  ts: typeof import('typescript');
}) => BlockedPrivateDalImportViolation[];
