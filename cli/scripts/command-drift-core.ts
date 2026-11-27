export type DriftCommandSpec = {
  readonly path: readonly string[];
  readonly aliases?: readonly string[];
  readonly summary: string;
  readonly risk: string;
  readonly authModes: readonly string[];
  readonly examples?: readonly { description: string; args: readonly string[] }[];
};

export type DriftSkillFile = {
  readonly path: string;
  readonly content: string;
};

export type DriftSourceFile = {
  readonly path: string;
  readonly content: string;
};

export type DriftViolationKind =
  | 'registry-duplicate-command'
  | 'registry-alias-collision'
  | 'registry-invalid-segment'
  | 'registry-missing-summary'
  | 'registry-missing-examples'
  | 'registry-invalid-risk'
  | 'registry-missing-auth-modes'
  | 'registry-skill-skills-collision'
  | 'skill-doc-invalid-command'
  | 'openapi-invalid-example'
  | 'arch-forbidden-import'
  | 'arch-domain-forbidden-import'
  | 'arch-reexport';

export type DriftOpenapiDocument = {
  readonly paths?: object;
  readonly components?: object;
};

export type DriftOpenapiDocuments = {
  readonly system: DriftOpenapiDocument;
  readonly dev: DriftOpenapiDocument;
};

export type DriftViolation = {
  readonly kind: DriftViolationKind;
  readonly file?: string;
  readonly line?: number;
  readonly command?: string;
  readonly message: string;
};

export type DriftCheckReport = {
  readonly ok: boolean;
  readonly checkedSpecs: number;
  readonly checkedSkillFiles: number;
  readonly checkedSrcFiles: number;
  readonly violations: DriftViolation[];
};

const VALID_RISKS = new Set(['read', 'write', 'destructive', 'admin']);
const VALID_AUTH_MODES = new Set(['none', 'token', 'personalKey', 'appKey']);
const KEBAB_SEGMENT_REGEX = /^[a-z0-9-]+$/;

const NON_SHELL_FENCE_LANGS = new Set([
  'json',
  'jsonc',
  'yaml',
  'yml',
  'ts',
  'tsx',
  'typescript',
  'js',
  'jsx',
  'javascript',
  'md',
  'markdown',
  'mermaid'
]);

const FORBIDDEN_GLOBAL_IMPORT_PATTERNS: readonly RegExp[] = [
  /^@types\/bun(?:\/|$)/,
  /^bun$/,
  /^bun:/,
  /^@fastgpt\/service(?:\/|$)/,
  /^mongoose(?:\/|$)/,
  /^next(?:\/|$)/
];

const FORBIDDEN_DOMAIN_IMPORT_MODULES = new Set([
  'node:fs',
  'node:fs/promises',
  'fs',
  'fs/promises',
  'node:os',
  'os',
  'commander',
  '@clack/prompts',
  'picocolors'
]);

const FORBIDDEN_SHARED_IMPORT_MODULES = new Set([
  'node:fs',
  'node:fs/promises',
  'fs',
  'fs/promises',
  'node:os',
  'os',
  'node:child_process',
  'child_process',
  'commander',
  '@clack/prompts',
  'picocolors'
]);

function checkRegistryIntegrity(specs: readonly DriftCommandSpec[]): DriftViolation[] {
  const violations: DriftViolation[] = [];
  const primaryCommands = new Set<string>();
  const allInvocations = new Map<string, string>();
  const skillSubcommands = new Set<string>();
  const skillsSubcommands = new Set<string>();

  for (const spec of specs) {
    const command = spec.path.join(' ');
    if (spec.path.length === 0) {
      violations.push({
        kind: 'registry-invalid-segment',
        message: 'Command spec has an empty path.'
      });
      continue;
    }

    for (const segment of spec.path) {
      if (!KEBAB_SEGMENT_REGEX.test(segment)) {
        violations.push({
          kind: 'registry-invalid-segment',
          command,
          message: `Command "${command}" contains invalid segment "${segment}" (expected kebab-case /^[a-z0-9-]+$/).`
        });
      }
    }

    if (primaryCommands.has(command)) {
      violations.push({
        kind: 'registry-duplicate-command',
        command,
        message: `Duplicate command path "${command}".`
      });
    } else {
      primaryCommands.add(command);
    }

    if (allInvocations.has(command)) {
      violations.push({
        kind: 'registry-alias-collision',
        command,
        message: `Command "${command}" collides with "${allInvocations.get(command)}".`
      });
    } else {
      allInvocations.set(command, `command "${command}"`);
    }

    if (spec.summary.trim().length === 0) {
      violations.push({
        kind: 'registry-missing-summary',
        command,
        message: `Command "${command}" has an empty summary.`
      });
    }

    if (!Array.isArray(spec.examples) || spec.examples.length === 0) {
      violations.push({
        kind: 'registry-missing-examples',
        command,
        message: `Command "${command}" must define at least one example.`
      });
    }

    if (!VALID_RISKS.has(spec.risk)) {
      violations.push({
        kind: 'registry-invalid-risk',
        command,
        message: `Command "${command}" has invalid risk "${spec.risk}".`
      });
    }

    if (
      !Array.isArray(spec.authModes) ||
      spec.authModes.length === 0 ||
      spec.authModes.some((mode) => !VALID_AUTH_MODES.has(mode))
    ) {
      violations.push({
        kind: 'registry-missing-auth-modes',
        command,
        message: `Command "${command}" must define non-empty valid authModes.`
      });
    }

    if (spec.path[0] === 'skill') {
      skillSubcommands.add(spec.path.slice(1).join(' '));
    } else if (spec.path[0] === 'skills') {
      skillsSubcommands.add(spec.path.slice(1).join(' '));
    }

    for (const rawAlias of spec.aliases ?? []) {
      const segments = rawAlias.trim().split(/\s+/).filter(Boolean);
      const alias = segments.join(' ');
      if (segments.length === 0 || segments.some((seg) => !KEBAB_SEGMENT_REGEX.test(seg))) {
        violations.push({
          kind: 'registry-invalid-segment',
          command: alias || rawAlias,
          message: `Alias "${rawAlias}" for "${command}" has invalid kebab-case segments.`
        });
        continue;
      }
      if (allInvocations.has(alias)) {
        violations.push({
          kind: 'registry-alias-collision',
          command: alias,
          message: `Alias "${alias}" (for "${command}") collides with ${allInvocations.get(alias)}.`
        });
      } else {
        allInvocations.set(alias, `alias of "${command}"`);
      }

      if (segments[0] === 'skill') {
        skillSubcommands.add(segments.slice(1).join(' '));
      } else if (segments[0] === 'skills') {
        skillsSubcommands.add(segments.slice(1).join(' '));
      }
    }
  }

  for (const sub of skillSubcommands) {
    if (skillsSubcommands.has(sub)) {
      violations.push({
        kind: 'registry-skill-skills-collision',
        command: `skills ${sub}`,
        message: `Subcommand "${sub}" exists under both "skill" and "skills".`
      });
    }
  }

  return violations;
}

type ExtractedInvocation = {
  readonly line: number;
  readonly raw: string;
  readonly tokens: readonly string[];
};

function splitShellSegments(lineText: string, splitBarePipe: boolean): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let i = 0; i < lineText.length; i += 1) {
    const ch = lineText[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '#' && (current.length === 0 || /\s$/.test(current))) {
      break;
    }
    if (ch === ';' || (ch === '&' && lineText[i + 1] === '&')) {
      if (current.trim().length > 0) {
        segments.push(current.trim());
      }
      current = '';
      if (ch === '&') {
        i += 1;
      }
      continue;
    }
    if (ch === '|' && lineText[i + 1] === '|') {
      if (current.trim().length > 0) {
        segments.push(current.trim());
      }
      current = '';
      i += 1;
      continue;
    }
    if (ch === '|') {
      const prevIsSpace = current.length === 0 || /\s$/.test(current);
      const nextIsSpace = i + 1 >= lineText.length || /\s/.test(lineText[i + 1]);
      if (splitBarePipe || (prevIsSpace && nextIsSpace)) {
        if (current.trim().length > 0) {
          segments.push(current.trim());
        }
        current = '';
        continue;
      }
    }
    current += ch;
  }

  if (current.trim().length > 0) {
    segments.push(current.trim());
  }
  return segments;
}

function tokenizeCommandArgs(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inToken = false;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (escaped) {
      current += ch;
      escaped = false;
      inToken = true;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      inToken = true;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      inToken = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current);
        current = '';
        inToken = false;
      }
      continue;
    }
    current += ch;
    inToken = true;
  }

  if (inToken) {
    tokens.push(current);
  }
  return tokens;
}

function collectFastgptInvocationsFromSegmentList(
  segments: readonly string[],
  line: number
): ExtractedInvocation[] {
  const results: ExtractedInvocation[] = [];
  for (const rawSeg of segments) {
    const stripped = rawSeg.replace(/^\$\s+/, '').trim();
    if (!/^fastgpt(?:\s|$)/.test(stripped)) {
      continue;
    }
    const tokens = tokenizeCommandArgs(stripped);
    if (tokens[0] !== 'fastgpt') {
      continue;
    }
    const rest = tokens.slice(1);
    if (rest.length === 0) {
      continue;
    }
    results.push({
      line,
      raw: stripped,
      tokens: rest
    });
  }
  return results;
}

/**
 * 从 Skill Markdown 中提取内联代码、Shell 代码块及 `$ fastgpt ...` 命令调用。
 */
export function extractSkillCommandInvocations(markdown: string): ExtractedInvocation[] {
  const lines = markdown.split(/\r?\n/);
  const invocations: ExtractedInvocation[] = [];
  let activeFence: { char: '`' | '~'; len: number; lang: string } | null = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNum = idx + 1;
    const line = lines[idx];

    if (activeFence === null) {
      const openMatch = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`~]*)/);
      if (openMatch) {
        const marker = openMatch[1];
        activeFence = {
          char: marker[0] as '`' | '~',
          len: marker.length,
          lang: (openMatch[2] ?? '').toLowerCase()
        };
        continue;
      }

      const inlineMatches = line.matchAll(/`([^`\n]+)`/g);
      for (const match of inlineMatches) {
        const inner = match[1].trim();
        if (!/^(?:\$\s+)?fastgpt(?:\s|$)/.test(inner)) {
          continue;
        }
        const segments = splitShellSegments(inner, false);
        invocations.push(...collectFastgptInvocationsFromSegmentList(segments, lineNum));
      }

      const outsideCode = line.replace(/`[^`\n]*`/g, '');
      const promptMatch = outsideCode.match(/^\s*\$\s+(fastgpt(?:\s+.*)?)$/);
      if (promptMatch) {
        const segments = splitShellSegments(promptMatch[1], false);
        invocations.push(...collectFastgptInvocationsFromSegmentList(segments, lineNum));
      }
      continue;
    }

    const closePattern = new RegExp(`^\\s*${activeFence.char}{${activeFence.len},}\\s*$`);
    if (closePattern.test(line)) {
      activeFence = null;
      continue;
    }

    if (NON_SHELL_FENCE_LANGS.has(activeFence.lang)) {
      continue;
    }

    let combined = line;
    while (combined.endsWith('\\') && idx + 1 < lines.length) {
      idx += 1;
      combined = `${combined.slice(0, -1)} ${lines[idx].trim()}`;
    }

    const trimmed = combined.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const segments = splitShellSegments(trimmed, true);
    invocations.push(...collectFastgptInvocationsFromSegmentList(segments, lineNum));
  }

  return invocations;
}

function checkSkillDocReferences({
  specs,
  skillFiles,
  allowedPendingCommands
}: {
  specs: readonly DriftCommandSpec[];
  skillFiles: readonly DriftSkillFile[];
  allowedPendingCommands: readonly string[];
}): DriftViolation[] {
  const validCommands = new Set<string>();
  const validGroups = new Set<string>();
  let maxDepth = 1;

  function registerCommandPath(cmd: string): void {
    const normalized = cmd.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return;
    }
    validCommands.add(normalized);
    const parts = normalized.split(' ');
    if (parts.length > maxDepth) {
      maxDepth = parts.length;
    }
    for (let i = 1; i < parts.length; i += 1) {
      validGroups.add(parts.slice(0, i).join(' '));
    }
  }

  for (const spec of specs) {
    registerCommandPath(spec.path.join(' '));
    for (const alias of spec.aliases ?? []) {
      registerCommandPath(alias);
    }
  }
  for (const pending of allowedPendingCommands) {
    registerCommandPath(pending);
  }

  const violations: DriftViolation[] = [];

  for (const file of skillFiles) {
    const invocations = extractSkillCommandInvocations(file.content);
    for (const inv of invocations) {
      const first = inv.tokens[0];
      if (first.startsWith('-')) {
        if (first === '--version' || first === '-v' || first === '--help' || first === '-h') {
          continue;
        }
        violations.push({
          kind: 'skill-doc-invalid-command',
          file: file.path,
          line: inv.line,
          command: inv.raw,
          message: `${file.path}:${inv.line} references invalid root flag "${inv.raw}".`
        });
        continue;
      }

      const leadingNonFlags: string[] = [];
      for (const token of inv.tokens) {
        if (token.startsWith('-')) {
          break;
        }
        leadingNonFlags.push(token);
      }

      const hasHelpFlag = inv.tokens.includes('--help') || inv.tokens.includes('-h');
      if (hasHelpFlag) {
        const fullPrefix = leadingNonFlags.join(' ');
        if (validCommands.has(fullPrefix) || validGroups.has(fullPrefix)) {
          continue;
        }
      }

      const matched = (() => {
        const limit = Math.min(leadingNonFlags.length, maxDepth);
        for (let len = limit; len >= 1; len -= 1) {
          const candidate = leadingNonFlags.slice(0, len).join(' ');
          if (validCommands.has(candidate)) {
            return candidate;
          }
        }
        return undefined;
      })();

      if (!matched) {
        violations.push({
          kind: 'skill-doc-invalid-command',
          file: file.path,
          line: inv.line,
          command: inv.raw,
          message: `${file.path}:${inv.line} references unknown CLI command "${inv.raw}".`
        });
      }
    }
  }

  return violations;
}

function stripCommentsPreservingLines(source: string): {
  withoutComments: string;
  withoutCommentsOrStrings: string;
} {
  let noComments = '';
  let noCommentsOrStrings = '';
  let state: 'code' | 'line-comment' | 'block-comment' | 'single' | 'double' | 'template' = 'code';
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'line-comment') {
      if (ch === '\n') {
        state = 'code';
        noComments += '\n';
        noCommentsOrStrings += '\n';
      } else {
        noComments += ' ';
        noCommentsOrStrings += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        noComments += '  ';
        noCommentsOrStrings += '  ';
        i += 1;
      } else {
        const replacement = ch === '\n' ? '\n' : ' ';
        noComments += replacement;
        noCommentsOrStrings += replacement;
      }
      continue;
    }

    if (state === 'single' || state === 'double' || state === 'template') {
      noComments += ch;
      noCommentsOrStrings += ch === '\n' ? '\n' : ' ';
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (
        (state === 'single' && ch === "'") ||
        (state === 'double' && ch === '"') ||
        (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      state = 'line-comment';
      noComments += '  ';
      noCommentsOrStrings += '  ';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      state = 'block-comment';
      noComments += '  ';
      noCommentsOrStrings += '  ';
      i += 1;
      continue;
    }

    noComments += ch;
    if (ch === "'") {
      state = 'single';
      noCommentsOrStrings += ' ';
    } else if (ch === '"') {
      state = 'double';
      noCommentsOrStrings += ' ';
    } else if (ch === '`') {
      state = 'template';
      noCommentsOrStrings += ' ';
    } else {
      noCommentsOrStrings += ch;
    }
  }

  return { withoutComments: noComments, withoutCommentsOrStrings: noCommentsOrStrings };
}

function getLineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function extractModuleSpecifiers({
  withoutComments,
  withoutCommentsOrStrings
}: {
  withoutComments: string;
  withoutCommentsOrStrings: string;
}): Array<{
  specifier: string;
  line: number;
  isReexport: boolean;
}> {
  const results: Array<{ specifier: string; line: number; isReexport: boolean }> = [];

  const isCodeTokenAt = (offset: number): boolean => {
    const ch = withoutCommentsOrStrings[offset];
    return ch !== undefined && ch !== ' ' && ch !== '\n' && ch !== '\r';
  };

  const importFromRegex =
    /(?:^|[;\n}])\s*(import)\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*(?:\s*,\s*(?:\*\s+as\s+[A-Za-z_$][\w$]*|\{[^;{}]*\}))?|\*\s+as\s+[A-Za-z_$][\w$]*|\{[^;{}]*\})\s+from\s*(['"])([^'"]+)\2/g;
  for (const match of withoutComments.matchAll(importFromRegex)) {
    const keywordOffset = (match.index ?? 0) + match[0].indexOf(match[1]);
    if (!isCodeTokenAt(keywordOffset)) {
      continue;
    }
    results.push({
      specifier: match[3],
      line: getLineNumberAt(withoutComments, keywordOffset),
      isReexport: false
    });
  }

  const exportFromRegex =
    /(?:^|[;\n}])\s*(export)\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^;{}]*\})\s*from\s*(['"])([^'"]+)\2/g;
  for (const match of withoutComments.matchAll(exportFromRegex)) {
    const keywordOffset = (match.index ?? 0) + match[0].indexOf(match[1]);
    if (!isCodeTokenAt(keywordOffset)) {
      continue;
    }
    results.push({
      specifier: match[3],
      line: getLineNumberAt(withoutComments, keywordOffset),
      isReexport: true
    });
  }

  const sideEffectImportRegex = /(?:^|[;\n}])\s*(import)\s*(['"])([^'"]+)\2/g;
  for (const match of withoutComments.matchAll(sideEffectImportRegex)) {
    const keywordOffset = (match.index ?? 0) + match[0].indexOf(match[1]);
    if (!isCodeTokenAt(keywordOffset)) {
      continue;
    }
    results.push({
      specifier: match[3],
      line: getLineNumberAt(withoutComments, keywordOffset),
      isReexport: false
    });
  }

  const dynamicImportRegex = /\b(import|require)\s*\(\s*(['"])([^'"]+)\2\s*\)/g;
  for (const match of withoutComments.matchAll(dynamicImportRegex)) {
    const keywordOffset = match.index ?? 0;
    if (!isCodeTokenAt(keywordOffset)) {
      continue;
    }
    results.push({
      specifier: match[3],
      line: getLineNumberAt(withoutComments, keywordOffset),
      isReexport: false
    });
  }

  return results;
}

function resolveLayer(filePath: string): 'shared' | 'infra' | 'domain' | 'cli' | 'other' {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/src/shared/') || normalized.startsWith('src/shared/')) {
    return 'shared';
  }
  if (normalized.includes('/src/infra/') || normalized.startsWith('src/infra/')) {
    return 'infra';
  }
  if (normalized.includes('/src/domain/') || normalized.startsWith('src/domain/')) {
    return 'domain';
  }
  if (normalized.includes('/src/cli/') || normalized.startsWith('src/cli/')) {
    return 'cli';
  }
  return 'other';
}

function checkArchitectureGuardrails(srcFiles: readonly DriftSourceFile[]): DriftViolation[] {
  const violations: DriftViolation[] = [];

  for (const file of srcFiles) {
    const normalizedPath = file.path.replace(/\\/g, '/');
    const layer = resolveLayer(normalizedPath);
    const { withoutComments, withoutCommentsOrStrings } = stripCommentsPreservingLines(
      file.content
    );
    const specifiers = extractModuleSpecifiers({ withoutComments, withoutCommentsOrStrings });

    for (const entry of specifiers) {
      if (entry.isReexport) {
        violations.push({
          kind: 'arch-reexport',
          file: file.path,
          line: entry.line,
          message: `${file.path}:${entry.line} uses forbidden re-export from "${entry.specifier}".`
        });
      }

      if (FORBIDDEN_GLOBAL_IMPORT_PATTERNS.some((pattern) => pattern.test(entry.specifier))) {
        violations.push({
          kind: 'arch-forbidden-import',
          file: file.path,
          line: entry.line,
          message: `${file.path}:${entry.line} imports forbidden package "${entry.specifier}".`
        });
      }

      if (layer === 'domain') {
        if (
          FORBIDDEN_DOMAIN_IMPORT_MODULES.has(entry.specifier) ||
          entry.specifier.startsWith('commander/') ||
          /(?:^|\/)cli(?:\/|$)/.test(entry.specifier)
        ) {
          violations.push({
            kind: 'arch-domain-forbidden-import',
            file: file.path,
            line: entry.line,
            message: `${file.path}:${entry.line} imports "${entry.specifier}" which is forbidden in src/domain/**.`
          });
        }
      } else if (layer === 'infra') {
        if (
          entry.specifier === 'commander' ||
          entry.specifier.startsWith('commander/') ||
          /(?:^|\/)(?:domain|cli)(?:\/|$)/.test(entry.specifier)
        ) {
          violations.push({
            kind: 'arch-forbidden-import',
            file: file.path,
            line: entry.line,
            message: `${file.path}:${entry.line} imports "${entry.specifier}" which violates infra layer boundaries.`
          });
        }
      } else if (layer === 'shared') {
        if (
          FORBIDDEN_SHARED_IMPORT_MODULES.has(entry.specifier) ||
          entry.specifier.startsWith('commander/') ||
          /(?:^|\/)(?:infra|domain|cli)(?:\/|$)/.test(entry.specifier)
        ) {
          violations.push({
            kind: 'arch-forbidden-import',
            file: file.path,
            line: entry.line,
            message: `${file.path}:${entry.line} imports "${entry.specifier}" which violates shared layer boundaries.`
          });
        }
      }
    }

    if (layer === 'domain') {
      for (const match of withoutCommentsOrStrings.matchAll(/\bprocess\.(stdout|stderr)\b/g)) {
        violations.push({
          kind: 'arch-domain-forbidden-import',
          file: file.path,
          line: getLineNumberAt(withoutCommentsOrStrings, match.index ?? 0),
          message: `${file.path} accesses process.${match[1]} directly inside src/domain/**.`
        });
      }
    }
  }

  return violations;
}

const API_VALUE_FLAGS = new Set([
  '--profile',
  '--base-url',
  '--token',
  '--api-key',
  '--format',
  '--fields',
  '--pick',
  '--timeout',
  '--ca-cert',
  '--source',
  '--tag',
  '--search',
  '--method',
  '--query',
  '--query-json',
  '--header',
  '--output',
  '--body',
  '--file'
]);

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

type ParsedApiInvocation = {
  readonly subcommand: string;
  readonly positionals: readonly string[];
  readonly source?: string;
  readonly tag?: string;
  readonly method?: string;
  readonly queryPairs: readonly string[];
  readonly queryJsons: readonly string[];
  readonly bodies: readonly string[];
  readonly files: readonly string[];
  readonly hasStdin: boolean;
  readonly hasNoValidate: boolean;
};

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeExampleApiPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withSlash === '/api') {
    return '/';
  }
  if (withSlash.startsWith('/api/')) {
    return withSlash.slice(4);
  }
  return withSlash;
}

function resolveJsonRef({
  doc,
  node,
  seen = new Set<string>()
}: {
  doc: DriftOpenapiDocument;
  node: unknown;
  seen?: Set<string>;
}): unknown {
  if (!isRecordObject(node)) {
    return node;
  }
  const rawRef = node.$ref;
  if (typeof rawRef !== 'string' || !rawRef.startsWith('#/')) {
    return node;
  }
  if (seen.has(rawRef)) {
    return undefined;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(rawRef);

  const segments = rawRef
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = doc;
  for (const seg of segments) {
    if (!isRecordObject(current) || !(seg in current)) {
      return node;
    }
    current = current[seg];
  }

  const resolvedTarget = resolveJsonRef({ doc, node: current, seen: nextSeen });
  if (!isRecordObject(resolvedTarget)) {
    return resolvedTarget;
  }

  const siblings: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node)) {
    if (key !== '$ref') {
      siblings[key] = val;
    }
  }
  return Object.keys(siblings).length > 0 ? { ...resolvedTarget, ...siblings } : resolvedTarget;
}

function parseApiInvocationTokens(tokens: readonly string[]): ParsedApiInvocation | undefined {
  if (tokens[0] !== 'api' || tokens.length < 2) {
    return undefined;
  }
  if (tokens.includes('--help') || tokens.includes('-h')) {
    return undefined;
  }

  const subcommand = tokens[1];
  const validSubcommands = new Set(['schema', 'get', 'post', 'put', 'delete', 'call']);
  if (!validSubcommands.has(subcommand)) {
    return undefined;
  }

  const positionals: string[] = [];
  const queryPairs: string[] = [];
  const queryJsons: string[] = [];
  const bodies: string[] = [];
  const files: string[] = [];
  let source: string | undefined;
  let tag: string | undefined;
  let method: string | undefined;
  let hasStdin = false;
  let hasNoValidate = false;

  const recordFlagValue = (flag: string, value: string): void => {
    if (flag === '--source') {
      source = value;
    } else if (flag === '--tag') {
      tag = value;
    } else if (flag === '--method') {
      method = value;
    } else if (flag === '--query') {
      queryPairs.push(value);
    } else if (flag === '--query-json') {
      queryJsons.push(value);
    } else if (flag === '--body') {
      bodies.push(value);
    } else if (flag === '--file') {
      files.push(value);
    }
  };

  for (let i = 2; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--') {
      positionals.push(...tokens.slice(i + 1));
      break;
    }
    if (token.startsWith('--') && token.includes('=')) {
      const eqIdx = token.indexOf('=');
      const flag = token.slice(0, eqIdx);
      const value = token.slice(eqIdx + 1);
      if (API_VALUE_FLAGS.has(flag)) {
        recordFlagValue(flag, value);
      }
      continue;
    }
    if (API_VALUE_FLAGS.has(token)) {
      const nextVal = tokens[i + 1];
      if (nextVal !== undefined) {
        recordFlagValue(token, nextVal);
        i += 1;
      }
      continue;
    }
    if (token === '--stdin') {
      hasStdin = true;
      continue;
    }
    if (token === '--no-validate') {
      hasNoValidate = true;
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    positionals.push(token);
  }

  return {
    subcommand,
    positionals,
    source,
    tag,
    method,
    queryPairs,
    queryJsons,
    bodies,
    files,
    hasStdin,
    hasNoValidate
  };
}

function collectQueryParameters({
  doc,
  pathItem,
  operation
}: {
  doc: DriftOpenapiDocument;
  pathItem: Record<string, unknown>;
  operation: Record<string, unknown>;
}): { declared: Set<string>; required: Set<string> } {
  const paramMap = new Map<string, { name: string; inLocation: string; required: boolean }>();
  const combined = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : [])
  ];

  for (const rawParam of combined) {
    const param = resolveJsonRef({ doc, node: rawParam });
    if (!isRecordObject(param) || typeof param.name !== 'string') {
      continue;
    }
    const inLocation = typeof param.in === 'string' ? param.in : 'query';
    paramMap.set(`${inLocation}:${param.name}`, {
      name: param.name,
      inLocation,
      required: param.required === true
    });
  }

  const declared = new Set<string>();
  const required = new Set<string>();
  for (const param of paramMap.values()) {
    if (param.inLocation === 'query') {
      declared.add(param.name);
      if (param.required) {
        required.add(param.name);
      }
    }
  }
  return { declared, required };
}

function collectAcceptedBodyKeys({
  doc,
  schema,
  seen = new Set<object>()
}: {
  doc: DriftOpenapiDocument;
  schema: unknown;
  seen?: Set<object>;
}): Set<string> {
  const keys = new Set<string>();
  const resolved = resolveJsonRef({ doc, node: schema });
  if (!isRecordObject(resolved) || seen.has(resolved)) {
    return keys;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(resolved);

  if (isRecordObject(resolved.properties)) {
    for (const key of Object.keys(resolved.properties)) {
      keys.add(key);
    }
  }
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = resolved[key];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        for (const item of collectAcceptedBodyKeys({ doc, schema: branch, seen: nextSeen })) {
          keys.add(item);
        }
      }
    }
  }
  return keys;
}

function validateBodyKeysAgainstSchema({
  doc,
  schema,
  bodyKeys,
  seen = new Set<object>()
}: {
  doc: DriftOpenapiDocument;
  schema: unknown;
  bodyKeys: Set<string>;
  seen?: Set<object>;
}): { ok: true } | { ok: false; missing: string[] } {
  const resolved = resolveJsonRef({ doc, node: schema });
  if (!isRecordObject(resolved) || seen.has(resolved)) {
    return { ok: true };
  }
  const nextSeen = new Set(seen);
  nextSeen.add(resolved);

  if (Array.isArray(resolved.required)) {
    const missing = resolved.required.filter(
      (item): item is string => typeof item === 'string' && !bodyKeys.has(item)
    );
    if (missing.length > 0) {
      return { ok: false, missing };
    }
  }

  if (Array.isArray(resolved.allOf)) {
    for (const branch of resolved.allOf) {
      const check = validateBodyKeysAgainstSchema({
        doc,
        schema: branch,
        bodyKeys,
        seen: nextSeen
      });
      if (!check.ok) {
        return check;
      }
    }
  }

  for (const unionKey of ['anyOf', 'oneOf'] as const) {
    const branches = resolved[unionKey];
    if (Array.isArray(branches) && branches.length > 0) {
      let bestMissing: string[] | undefined;
      let anyMatched = false;
      for (const branch of branches) {
        const check = validateBodyKeysAgainstSchema({
          doc,
          schema: branch,
          bodyKeys,
          seen: nextSeen
        });
        if (check.ok) {
          anyMatched = true;
          break;
        }
        if (!bestMissing || check.missing.length < bestMissing.length) {
          bestMissing = check.missing;
        }
      }
      if (!anyMatched) {
        return { ok: false, missing: bestMissing ?? [] };
      }
    }
  }

  return { ok: true };
}

function parseInlineJsonObject(
  raw: string
):
  | { status: 'not-object' }
  | { status: 'invalid'; error: string }
  | { status: 'object'; keys: Set<string> } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { status: 'not-object' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (isRecordObject(parsed)) {
      return { status: 'object', keys: new Set(Object.keys(parsed)) };
    }
    return { status: 'not-object' };
  } catch (error) {
    if (trimmed.includes('<') && !trimmed.includes('":"<')) {
      return { status: 'not-object' };
    }
    return {
      status: 'invalid',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function getJsonRequestBodySchema({
  doc,
  operation
}: {
  doc: DriftOpenapiDocument;
  operation: Record<string, unknown>;
}): { hasRequestBody: boolean; schema?: unknown; explicitRequired: boolean } {
  const rawBody = resolveJsonRef({ doc, node: operation.requestBody });
  if (!isRecordObject(rawBody)) {
    return { hasRequestBody: false, explicitRequired: false };
  }
  const content = isRecordObject(rawBody.content) ? rawBody.content : undefined;
  const jsonContent =
    content && isRecordObject(content['application/json'])
      ? content['application/json']
      : undefined;
  return {
    hasRequestBody: true,
    schema: jsonContent?.schema,
    explicitRequired: rawBody.required === true
  };
}

function validateApiSchemaExample({
  parsed,
  openapiDocs,
  context
}: {
  parsed: ParsedApiInvocation;
  openapiDocs: DriftOpenapiDocuments;
  context: { file?: string; line?: number; command: string; prefix: string };
}): DriftViolation[] {
  const source = parsed.source ?? 'system';
  if (source !== 'system' && source !== 'dev') {
    return [
      {
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: invalid --source "${source}" (expected "system" or "dev").`
      }
    ];
  }

  const doc = openapiDocs[source];
  const otherSource = source === 'system' ? 'dev' : 'system';
  const otherDoc = openapiDocs[otherSource];
  const paths = isRecordObject(doc.paths) ? doc.paths : {};
  const otherPaths = isRecordObject(otherDoc.paths) ? otherDoc.paths : {};
  const violations: DriftViolation[] = [];

  const targetPathRaw = parsed.positionals[0];
  const methodFilter = parsed.method?.toLowerCase();
  if (methodFilter && !HTTP_METHODS.has(methodFilter)) {
    violations.push({
      kind: 'openapi-invalid-example',
      file: context.file,
      line: context.line,
      command: context.command,
      message: `${context.prefix}: invalid --method "${parsed.method}" in "api schema".`
    });
    return violations;
  }

  if (targetPathRaw && !/<[^>]+>/.test(targetPathRaw)) {
    const normalizedPath = normalizeExampleApiPath(targetPathRaw);
    const pathItem = paths[normalizedPath];
    if (!isRecordObject(pathItem)) {
      const hint = isRecordObject(otherPaths[normalizedPath])
        ? ` Found in "--source ${otherSource}" instead.`
        : '';
      violations.push({
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: path "${normalizedPath}" does not exist in "--source ${source}" OpenAPI.${hint}`
      });
      return violations;
    }

    if (methodFilter && !isRecordObject(pathItem[methodFilter])) {
      const available = Array.from(HTTP_METHODS).filter((m) => isRecordObject(pathItem[m]));
      violations.push({
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: method "${methodFilter.toUpperCase()}" is not defined for "${normalizedPath}" in "--source ${source}" (available: ${available.map((m) => m.toUpperCase()).join(', ') || 'none'}).`
      });
    }
    return violations;
  }

  if (parsed.tag || methodFilter) {
    const tagNeedle = parsed.tag?.toLowerCase();
    let matchedAny = false;
    for (const pathItem of Object.values(paths)) {
      if (!isRecordObject(pathItem)) {
        continue;
      }
      for (const methodKey of HTTP_METHODS) {
        const op = pathItem[methodKey];
        if (!isRecordObject(op)) {
          continue;
        }
        if (methodFilter && methodKey !== methodFilter) {
          continue;
        }
        if (tagNeedle) {
          const tags = Array.isArray(op.tags)
            ? op.tags.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase())
            : [];
          if (!tags.includes(tagNeedle)) {
            continue;
          }
        }
        matchedAny = true;
        break;
      }
      if (matchedAny) {
        break;
      }
    }

    if (!matchedAny) {
      violations.push({
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: "api schema" filters (${[
          parsed.tag ? `--tag "${parsed.tag}"` : undefined,
          parsed.method ? `--method "${parsed.method}"` : undefined
        ]
          .filter(Boolean)
          .join(', ')}) match 0 endpoints in "--source ${source}" OpenAPI.`
      });
    }
  }

  return violations;
}

function validateApiRequestExample({
  parsed,
  openapiDocs,
  context
}: {
  parsed: ParsedApiInvocation;
  openapiDocs: DriftOpenapiDocuments;
  context: { file?: string; line?: number; command: string; prefix: string };
}): DriftViolation[] {
  const source = parsed.source ?? 'system';
  if (source !== 'system' && source !== 'dev') {
    return [
      {
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: invalid --source "${source}" (expected "system" or "dev").`
      }
    ];
  }

  const rawMethod =
    parsed.subcommand === 'call' ? parsed.positionals[0] : parsed.subcommand.toUpperCase();
  const rawPath = parsed.subcommand === 'call' ? parsed.positionals[1] : parsed.positionals[0];

  if (!rawPath || /<[^>]+>/.test(rawPath) || /^https?:\/\//i.test(rawPath)) {
    return [];
  }

  const methodKey = rawMethod?.toLowerCase();
  if (!methodKey || !HTTP_METHODS.has(methodKey)) {
    return [
      {
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: unsupported HTTP method "${rawMethod ?? ''}".`
      }
    ];
  }

  const doc = openapiDocs[source];
  const otherSource = source === 'system' ? 'dev' : 'system';
  const otherDoc = openapiDocs[otherSource];
  const paths = isRecordObject(doc.paths) ? doc.paths : {};
  const otherPaths = isRecordObject(otherDoc.paths) ? otherDoc.paths : {};
  const normalizedPath = normalizeExampleApiPath(rawPath);
  const pathItem = paths[normalizedPath];

  if (!isRecordObject(pathItem)) {
    const hint = isRecordObject(otherPaths[normalizedPath])
      ? ` Found in "--source ${otherSource}" instead.`
      : '';
    return [
      {
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: path "${normalizedPath}" does not exist in "--source ${source}" OpenAPI.${hint}`
      }
    ];
  }

  const operation = pathItem[methodKey];
  if (!isRecordObject(operation)) {
    const available = Array.from(HTTP_METHODS).filter((m) => isRecordObject(pathItem[m]));
    return [
      {
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: ${methodKey.toUpperCase()} "${normalizedPath}" is not defined in "--source ${source}" (available: ${available.map((m) => m.toUpperCase()).join(', ') || 'none'}).`
      }
    ];
  }

  if (parsed.hasNoValidate) {
    return [];
  }

  const violations: DriftViolation[] = [];
  const queryParams = collectQueryParameters({ doc, pathItem, operation });
  const providedQueryKeys = new Set<string>();
  let queryFullyKnown = true;

  for (const pair of parsed.queryPairs) {
    const eqIdx = pair.indexOf('=');
    const key = (eqIdx >= 0 ? pair.slice(0, eqIdx) : pair).trim();
    if (key.length > 0 && !/<[^>]+>/.test(key)) {
      providedQueryKeys.add(key);
    } else if (/<[^>]+>/.test(key)) {
      queryFullyKnown = false;
    }
  }

  for (const rawJson of parsed.queryJsons) {
    const parsedJson = parseInlineJsonObject(rawJson);
    if (parsedJson.status === 'invalid') {
      violations.push({
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: invalid --query-json payload (${parsedJson.error}).`
      });
      queryFullyKnown = false;
    } else if (parsedJson.status === 'object') {
      for (const key of parsedJson.keys) {
        providedQueryKeys.add(key);
      }
    } else {
      queryFullyKnown = false;
    }
  }

  const bodyMeta = getJsonRequestBodySchema({ doc, operation });
  const acceptedBodyKeys = bodyMeta.schema
    ? collectAcceptedBodyKeys({ doc, schema: bodyMeta.schema })
    : new Set<string>();

  for (const qKey of providedQueryKeys) {
    if (!queryParams.declared.has(qKey)) {
      const hint = acceptedBodyKeys.has(qKey)
        ? ` "${qKey}" belongs in the JSON request body (--body/--file), not query parameters.`
        : '';
      violations.push({
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: query parameter "${qKey}" is not declared for ${methodKey.toUpperCase()} "${normalizedPath}" (--source ${source}).${hint}`
      });
    }
  }

  if (queryFullyKnown) {
    for (const reqParam of queryParams.required) {
      if (!providedQueryKeys.has(reqParam)) {
        violations.push({
          kind: 'openapi-invalid-example',
          file: context.file,
          line: context.line,
          command: context.command,
          message: `${context.prefix}: missing required query parameter "${reqParam}" for ${methodKey.toUpperCase()} "${normalizedPath}" (--source ${source}).`
        });
      }
    }
  }

  if (parsed.bodies.length > 0 && !bodyMeta.hasRequestBody) {
    violations.push({
      kind: 'openapi-invalid-example',
      file: context.file,
      line: context.line,
      command: context.command,
      message: `${context.prefix}: --body was passed, but ${methodKey.toUpperCase()} "${normalizedPath}" (--source ${source}) declares no requestBody.`
    });
  } else if (parsed.files.length > 0 && !bodyMeta.hasRequestBody) {
    violations.push({
      kind: 'openapi-invalid-example',
      file: context.file,
      line: context.line,
      command: context.command,
      message: `${context.prefix}: --file was passed, but ${methodKey.toUpperCase()} "${normalizedPath}" (--source ${source}) declares no requestBody.`
    });
  }

  if (parsed.bodies.length > 0 && bodyMeta.schema) {
    for (const rawBody of parsed.bodies) {
      const parsedBody = parseInlineJsonObject(rawBody);
      if (parsedBody.status === 'invalid') {
        violations.push({
          kind: 'openapi-invalid-example',
          file: context.file,
          line: context.line,
          command: context.command,
          message: `${context.prefix}: invalid --body JSON (${parsedBody.error}).`
        });
        continue;
      }
      if (parsedBody.status === 'object') {
        const schemaCheck = validateBodyKeysAgainstSchema({
          doc,
          schema: bodyMeta.schema,
          bodyKeys: parsedBody.keys
        });
        if (!schemaCheck.ok && schemaCheck.missing.length > 0) {
          violations.push({
            kind: 'openapi-invalid-example',
            file: context.file,
            line: context.line,
            command: context.command,
            message: `${context.prefix}: --body for ${methodKey.toUpperCase()} "${normalizedPath}" (--source ${source}) is missing required field(s): ${schemaCheck.missing.join(', ')}.`
          });
        }
      }
    }
  } else if (
    bodyMeta.hasRequestBody &&
    bodyMeta.schema &&
    parsed.bodies.length === 0 &&
    parsed.files.length === 0 &&
    !parsed.hasStdin
  ) {
    const emptyCheck = validateBodyKeysAgainstSchema({
      doc,
      schema: bodyMeta.schema,
      bodyKeys: new Set()
    });
    if (bodyMeta.explicitRequired || (!emptyCheck.ok && emptyCheck.missing.length > 0)) {
      violations.push({
        kind: 'openapi-invalid-example',
        file: context.file,
        line: context.line,
        command: context.command,
        message: `${context.prefix}: ${methodKey.toUpperCase()} "${normalizedPath}" (--source ${source}) requires a JSON request body (--body/--file/--stdin).`
      });
    }
  }

  return violations;
}

/**
 * 校验 CommandSpec 与 SKILL.md 中所有 `fastgpt api` 示例与官方 System/Dev OpenAPI 合约一致。
 */
export function checkOpenapiApiExamples({
  specs,
  skillFiles,
  openapiDocs
}: {
  specs: readonly DriftCommandSpec[];
  skillFiles: readonly DriftSkillFile[];
  openapiDocs: DriftOpenapiDocuments;
}): DriftViolation[] {
  const violations: DriftViolation[] = [];

  const validateTokens = ({
    tokens,
    file,
    line,
    command,
    prefix
  }: {
    tokens: readonly string[];
    file?: string;
    line?: number;
    command: string;
    prefix: string;
  }): void => {
    const parsed = parseApiInvocationTokens(tokens);
    if (!parsed) {
      return;
    }
    const context = { file, line, command, prefix };
    if (parsed.subcommand === 'schema') {
      violations.push(...validateApiSchemaExample({ parsed, openapiDocs, context }));
    } else {
      violations.push(...validateApiRequestExample({ parsed, openapiDocs, context }));
    }
  };

  for (const spec of specs) {
    if (spec.path[0] !== 'api') {
      continue;
    }
    const specCmd = spec.path.join(' ');
    for (const example of spec.examples ?? []) {
      validateTokens({
        tokens: example.args,
        command: `fastgpt ${example.args.join(' ')}`,
        prefix: `Command spec "${specCmd}" example "${example.description}"`
      });
    }
  }

  for (const file of skillFiles) {
    const invocations = extractSkillCommandInvocations(file.content);
    for (const inv of invocations) {
      if (inv.tokens[0] !== 'api') {
        continue;
      }
      validateTokens({
        tokens: inv.tokens,
        file: file.path,
        line: inv.line,
        command: inv.raw,
        prefix: `${file.path}:${inv.line}`
      });
    }
  }

  return violations;
}

/**
 * 执行 CLI 命令注册表完整性、Skill 命令引用一致性、OpenAPI 示例合约与四层架构护栏检查。
 */
export function runCommandDriftChecks({
  specs,
  skillFiles,
  srcFiles,
  allowedPendingCommands = [],
  openapiDocs
}: {
  specs: readonly DriftCommandSpec[];
  skillFiles: readonly DriftSkillFile[];
  srcFiles: readonly DriftSourceFile[];
  allowedPendingCommands?: readonly string[];
  openapiDocs?: DriftOpenapiDocuments;
}): DriftCheckReport {
  const violations = [
    ...checkRegistryIntegrity(specs),
    ...checkSkillDocReferences({ specs, skillFiles, allowedPendingCommands }),
    ...checkArchitectureGuardrails(srcFiles),
    ...(openapiDocs ? checkOpenapiApiExamples({ specs, skillFiles, openapiDocs }) : [])
  ];

  return {
    ok: violations.length === 0,
    checkedSpecs: specs.length,
    checkedSkillFiles: skillFiles.length,
    checkedSrcFiles: srcFiles.length,
    violations
  };
}
