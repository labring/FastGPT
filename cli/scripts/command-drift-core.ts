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
  | 'arch-forbidden-import'
  | 'arch-domain-forbidden-import'
  | 'arch-reexport';

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

/**
 * 执行 CLI 命令注册表完整性、Skill 命令引用一致性与四层架构护栏检查。
 */
export function runCommandDriftChecks({
  specs,
  skillFiles,
  srcFiles,
  allowedPendingCommands = []
}: {
  specs: readonly DriftCommandSpec[];
  skillFiles: readonly DriftSkillFile[];
  srcFiles: readonly DriftSourceFile[];
  allowedPendingCommands?: readonly string[];
}): DriftCheckReport {
  const violations = [
    ...checkRegistryIntegrity(specs),
    ...checkSkillDocReferences({ specs, skillFiles, allowedPendingCommands }),
    ...checkArchitectureGuardrails(srcFiles)
  ];

  return {
    ok: violations.length === 0,
    checkedSpecs: specs.length,
    checkedSkillFiles: skillFiles.length,
    checkedSrcFiles: srcFiles.length,
    violations
  };
}
