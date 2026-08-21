#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage:
  node validate-namespace.mjs <zh-CN-source.json> [target.json ...]

When targets are omitted, the script validates the matching namespace in every
sibling locale directory.`);
  process.exit(args.includes('--help') ? 0 : 1);
}

const sourcePath = path.resolve(args[0]);
const sourceLocale = path.basename(path.dirname(sourcePath));
const sourceNamespace = path.basename(sourcePath, path.extname(sourcePath));

if (sourceLocale !== 'zh-CN') {
  console.error(`Source must be inside a zh-CN locale directory: ${sourcePath}`);
  process.exit(1);
}

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error.message}`);
  }
};

const flatten = (value, currentPath = '$', result = new Map()) => {
  const type = (() => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  })();

  result.set(currentPath, { type, value });

  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${currentPath}[${index}]`, result));
  } else if (type === 'object') {
    Object.entries(value).forEach(([key, item]) =>
      flatten(item, currentPath === '$' ? key : `${currentPath}.${key}`, result)
    );
  }

  return result;
};

const collectMatches = (value, pattern, normalize = (match) => match, sort = true) => {
  const matches = [];
  for (const match of value.matchAll(pattern)) {
    matches.push(normalize(match));
  }
  return sort ? matches.sort() : matches;
};

const collectProtectedTokens = (value) => ({
  interpolations: collectMatches(value, /{{-?\s*[^{}]+?\s*}}/g, (match) => match[0]),
  tags: collectMatches(value, /<\/?[A-Za-z][\w.-]*(?:\s[^<>]*?)?\/?>/g, (match) => match[0], false),
  urls: collectMatches(value, /https?:\/\/[^\s<>"']+/g, (match) => match[0]),
  printf: collectMatches(value, /%(?:\d+\$)?[sdif]/g, (match) => match[0]),
  newlines: (value.match(/\n/g) ?? []).length,
  literalNewlines: (value.match(/\\n/g) ?? []).length
});

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const formatValue = (value) => JSON.stringify(value);

const glossaryPath = new URL('../references/fastgpt-glossary.json', import.meta.url);
const glossary = readJson(glossaryPath);

const containsEnglishTerm = (value, term) => {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const pluralSuffix = /s$/i.test(term) ? '' : 's?';
  return new RegExp(`(^|[^A-Za-z0-9])${escapedTerm}${pluralSuffix}(?=$|[^A-Za-z0-9])`, 'i').test(
    value
  );
};

/**
 * Remove protected runtime tokens before glossary checks so identifiers such as
 * `{{quote}}` are not mistaken for user-visible translations.
 */
const getGlossaryCheckText = (value) =>
  value.replace(/{{-?\s*[^{}]+?\s*}}/g, ' ').replace(/https?:\/\/[^\s<>"']+/g, ' ');

/**
 * Select non-overlapping glossary matches, preferring the longest Chinese term.
 * This prevents component rules from overriding an approved compound term.
 */
const getGlossaryMatches = (sourceValue, rules = glossary.terms) => {
  const candidates = rules.flatMap((rule) =>
    rule.zh.flatMap((sourceTerm) => {
      const matches = [];
      let start = sourceValue.indexOf(sourceTerm);
      while (start !== -1) {
        matches.push({ rule, sourceTerm, start, end: start + sourceTerm.length });
        start = sourceValue.indexOf(sourceTerm, start + sourceTerm.length);
      }
      return matches;
    })
  );

  const selected = [];
  for (const candidate of candidates.sort(
    (left, right) => right.sourceTerm.length - left.sourceTerm.length || left.start - right.start
  )) {
    const overlaps = selected.some(
      (item) => candidate.start < item.end && candidate.end > item.start
    );
    if (!overlaps) selected.push(candidate);
  }
  return selected.sort((left, right) => left.start - right.start);
};

const containsLocaleTerm = (value, term) =>
  value.toLocaleLowerCase().includes(term.toLocaleLowerCase());

const discoverTargets = () => {
  if (args.length > 1) return args.slice(1).map((item) => path.resolve(item));

  const localeRoot = path.dirname(path.dirname(sourcePath));
  return fs
    .readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'zh-CN')
    .map((entry) => path.join(localeRoot, entry.name, path.basename(sourcePath)))
    .sort();
};

let source;
try {
  source = readJson(sourcePath);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const sourceEntries = flatten(source);
const errors = [];
const warnings = [];
const targets = discoverTargets();

if (targets.length === 0) {
  errors.push('No target locale directories were found.');
}

for (const targetPath of targets) {
  const targetLocale = path.basename(path.dirname(targetPath));

  if (!fs.existsSync(targetPath)) {
    errors.push(`[${targetLocale}] Missing target file: ${targetPath}`);
    continue;
  }

  let target;
  try {
    target = readJson(targetPath);
  } catch (error) {
    errors.push(error.message);
    continue;
  }

  const targetEntries = flatten(target);
  const sourcePaths = [...sourceEntries.keys()];
  const targetPaths = [...targetEntries.keys()];
  const hasSamePaths =
    sourcePaths.length === targetPaths.length &&
    sourcePaths.every((entryPath) => targetEntries.has(entryPath));

  if (hasSamePaths && !sameValue(sourcePaths, targetPaths)) {
    errors.push(`[${targetLocale}] Key or collection item order differs from zh-CN.`);
  }

  for (const [entryPath, sourceEntry] of sourceEntries) {
    const targetEntry = targetEntries.get(entryPath);
    if (!targetEntry) {
      errors.push(`[${targetLocale}] Missing path: ${entryPath}`);
      continue;
    }

    if (sourceEntry.type !== targetEntry.type) {
      errors.push(
        `[${targetLocale}] Type mismatch at ${entryPath}: ${sourceEntry.type} != ${targetEntry.type}`
      );
      continue;
    }

    if (sourceEntry.type !== 'string') continue;

    const sourceTokens = collectProtectedTokens(sourceEntry.value);
    const targetTokens = collectProtectedTokens(targetEntry.value);

    for (const tokenType of Object.keys(sourceTokens)) {
      if (!sameValue(sourceTokens[tokenType], targetTokens[tokenType])) {
        errors.push(
          `[${targetLocale}] Protected ${tokenType} differ at ${entryPath}: ` +
            `${formatValue(sourceTokens[tokenType])} != ${formatValue(targetTokens[tokenType])}`
        );
      }
    }

    if (targetLocale === 'en' && /\p{Script=Han}/u.test(targetEntry.value)) {
      const reason =
        targetEntry.value === sourceEntry.value ? 'unchanged from zh-CN' : 'contains Han text';
      warnings.push(`[${targetLocale}] ${entryPath} ${reason}: ${formatValue(targetEntry.value)}`);
    }

    if (targetLocale === 'en') {
      const glossaryCheckText = getGlossaryCheckText(targetEntry.value);
      for (const { rule, sourceTerm } of getGlossaryMatches(sourceEntry.value)) {
        const contextOverride = glossary.contextOverrides?.find(
          (item) =>
            item.namespace === sourceNamespace &&
            item.path === entryPath &&
            item.source === sourceTerm
        );
        const effectiveRule = contextOverride ?? rule;
        const forbiddenTerms = effectiveRule.forbidden.filter((term) =>
          containsEnglishTerm(glossaryCheckText, term)
        );
        if (forbiddenTerms.length > 0) {
          errors.push(
            `[${targetLocale}] Forbidden glossary translation at ${entryPath} for ` +
              `${formatValue(sourceTerm)}: ${forbiddenTerms.map(formatValue).join(', ')}`
          );
        }

        const hasCanonicalTerm = effectiveRule.en.some((term) =>
          containsEnglishTerm(glossaryCheckText, term)
        );
        if (!hasCanonicalTerm) {
          warnings.push(
            `[${targetLocale}] Canonical glossary term may be missing at ${entryPath} for ` +
              `${formatValue(sourceTerm)}; expected one of ${formatValue(effectiveRule.en)}`
          );
        }
      }
    }

    const localeGlossary = glossary.localeGlossaries?.[targetLocale] ?? [];
    if (localeGlossary.length > 0) {
      const glossaryCheckText = getGlossaryCheckText(targetEntry.value);
      for (const { rule, sourceTerm } of getGlossaryMatches(sourceEntry.value, localeGlossary)) {
        const contextOverride = glossary.contextOverrides?.find(
          (item) =>
            item.namespace === sourceNamespace &&
            item.path === entryPath &&
            item.source === sourceTerm &&
            item[targetLocale]
        );
        const canonicalTerms = contextOverride?.[targetLocale] ?? rule.target;
        const forbiddenTerms = rule.forbidden.filter((term) =>
          containsLocaleTerm(glossaryCheckText, term)
        );
        if (forbiddenTerms.length > 0) {
          errors.push(
            `[${targetLocale}] Forbidden glossary translation at ${entryPath} for ` +
              `${formatValue(sourceTerm)}: ${forbiddenTerms.map(formatValue).join(', ')}`
          );
        }

        const hasCanonicalTerm = canonicalTerms.some((term) =>
          containsLocaleTerm(glossaryCheckText, term)
        );
        if (!hasCanonicalTerm) {
          warnings.push(
            `[${targetLocale}] Canonical glossary term may be missing at ${entryPath} for ` +
              `${formatValue(sourceTerm)}; expected one of ${formatValue(canonicalTerms)}`
          );
        }
      }
    }
  }

  for (const entryPath of targetEntries.keys()) {
    if (!sourceEntries.has(entryPath)) {
      errors.push(`[${targetLocale}] Extra path not present in zh-CN: ${entryPath}`);
    }
  }
}

console.log(`Source: ${sourcePath}`);
console.log(`Targets checked: ${targets.length}`);

if (warnings.length > 0) {
  console.warn(`\nWarnings (${warnings.length}):`);
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length > 0) {
  console.error(`\nErrors (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nValidation passed.');
