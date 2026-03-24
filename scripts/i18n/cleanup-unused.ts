import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };

type TranslationGroup = {
  name: 'web' | 'document';
  rootDir: string;
  localeDirs: string[];
  scanRoots: string[];
  defaultNamespace: string;
};

type TranslationNamespaceFile = {
  locale: string;
  filePath: string;
  json: JsonObject;
};

type TranslationNamespace = {
  groupName: TranslationGroup['name'];
  namespace: string;
  files: TranslationNamespaceFile[];
  existingPaths: Set<string>;
};

type PruneResult = {
  kept: boolean;
  value?: JsonValue;
  removedPaths: string[];
};

const repoRoot = process.cwd();
const groups: TranslationGroup[] = [
  {
    name: 'web',
    rootDir: path.join(repoRoot, 'packages/web/i18n'),
    localeDirs: ['en', 'zh-CN', 'zh-Hant'],
    scanRoots: [path.join(repoRoot, 'packages'), path.join(repoRoot, 'projects')],
    defaultNamespace: 'common'
  },
  {
    name: 'document',
    rootDir: path.join(repoRoot, 'document/i18n'),
    localeDirs: ['en', 'zh-CN'],
    scanRoots: [path.join(repoRoot, 'document')],
    defaultNamespace: 'common'
  }
];

const ignoredDirs = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'public'
]);
const astExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const textExtensions = new Set(['.md', '.mdx']);
const maxScanFileSize = 512 * 1024;

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const isDryRun = !shouldWrite;

function main() {
  const namespaces = groups.flatMap(loadGroupNamespaces);

  if (namespaces.length === 0) {
    throw new Error('No translation files found.');
  }

  const namespacesByGroup = new Map<TranslationGroup['name'], Map<string, TranslationNamespace>>();

  namespaces.forEach((namespace) => {
    const groupMap =
      namespacesByGroup.get(namespace.groupName) ?? new Map<string, TranslationNamespace>();
    groupMap.set(namespace.namespace, namespace);
    namespacesByGroup.set(namespace.groupName, groupMap);
  });

  const usedRefsByGroup = new Map<TranslationGroup['name'], Set<string>>();

  groups.forEach((group) => {
    const namespaceMap =
      namespacesByGroup.get(group.name) ?? new Map<string, TranslationNamespace>();
    const sourceFiles = group.scanRoots.flatMap((root) => collectSourceFiles(root));
    const usedRefs = collectUsedTranslationRefs(sourceFiles, group, namespaceMap);
    usedRefsByGroup.set(group.name, usedRefs);

    console.log(
      `[${group.name}] [${isDryRun ? 'dry-run' : 'write'}] scanned ${sourceFiles.length} files, found ${usedRefs.size} used translation refs`
    );
  });

  const namespaceResults = namespaces.map((namespace) => {
    const usedRefs = usedRefsByGroup.get(namespace.groupName) ?? new Set<string>();
    const usedPaths = new Set<string>();

    namespace.existingPaths.forEach((keyPath) => {
      if (usedRefs.has(toRef(namespace.namespace, keyPath))) {
        usedPaths.add(keyPath);
      }
    });

    const removedPaths = Array.from(namespace.existingPaths).filter(
      (keyPath) => !usedPaths.has(keyPath)
    );

    return {
      namespace,
      usedPaths,
      removedPaths
    };
  });

  const totalRemoved = namespaceResults.reduce((sum, item) => sum + item.removedPaths.length, 0);

  if (totalRemoved === 0) {
    console.log('No unused translations found.');
    return;
  }

  namespaceResults
    .filter((item) => item.removedPaths.length > 0)
    .sort((a, b) => b.removedPaths.length - a.removedPaths.length)
    .forEach(({ namespace, removedPaths }) => {
      console.log(
        `[${namespace.groupName}] ${namespace.namespace}: ${removedPaths.length} unused translation keys`
      );
      removedPaths.slice(0, 20).forEach((keyPath) => {
        console.log(`- ${namespace.namespace}:${keyPath}`);
      });
      if (removedPaths.length > 20) {
        console.log(`- ... ${removedPaths.length - 20} more`);
      }
    });

  if (isDryRun) {
    console.log('Run with --write to remove the unused translation keys from all locale files.');
    return;
  }

  namespaceResults.forEach(({ namespace, usedPaths }) => {
    namespace.files.forEach((file) => {
      const result = pruneJsonObject(file.json, '', usedPaths);
      const nextJson = (result.kept ? result.value : {}) as JsonObject;
      fs.writeFileSync(file.filePath, JSON.stringify(nextJson, null, 2) + '\n', 'utf8');
    });
  });

  console.log(`Updated ${totalRemoved} unused translation keys across locale files.`);
}

function loadGroupNamespaces(group: TranslationGroup): TranslationNamespace[] {
  if (!fs.existsSync(group.rootDir)) {
    return [];
  }

  const namespaceMap = new Map<string, TranslationNamespace>();

  group.localeDirs.forEach((locale) => {
    const localeDir = path.join(group.rootDir, locale);

    if (!fs.existsSync(localeDir)) {
      return;
    }

    fs.readdirSync(localeDir)
      .filter((name) => name.endsWith('.json'))
      .forEach((fileName) => {
        const namespace = fileName.replace(/\.json$/, '');
        const filePath = path.join(localeDir, fileName);
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonObject;

        const current =
          namespaceMap.get(namespace) ??
          ({
            groupName: group.name,
            namespace,
            files: [],
            existingPaths: new Set<string>()
          } satisfies TranslationNamespace);

        current.files.push({
          locale,
          filePath,
          json
        });

        collectExistingPaths(json).forEach((keyPath) => current.existingPaths.add(keyPath));
        namespaceMap.set(namespace, current);
      });
  });

  return Array.from(namespaceMap.values());
}

function collectExistingPaths(value: JsonValue, prefix = ''): string[] {
  if (!isPlainObject(value)) {
    return prefix ? [prefix] : [];
  }

  const paths: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(child)) {
      paths.push(...collectExistingPaths(child, nextPath));
      continue;
    }

    paths.push(nextPath);
  }

  return paths;
}

function pruneJsonObject(value: JsonValue, prefix: string, usedPaths: Set<string>): PruneResult {
  if (!isPlainObject(value)) {
    if (!prefix || usedPaths.has(prefix)) {
      return {
        kept: true,
        value
      };
    }

    return {
      kept: false,
      removedPaths: [prefix]
    };
  }

  if (prefix && usedPaths.has(prefix)) {
    return {
      kept: true,
      value
    };
  }

  const nextObject: JsonObject = {};
  const removedPaths: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    const childResult = pruneJsonObject(child, nextPath, usedPaths);

    if (childResult.kept && childResult.value !== undefined) {
      nextObject[key] = childResult.value;
      continue;
    }

    removedPaths.push(...childResult.removedPaths);
  }

  if (Object.keys(nextObject).length === 0) {
    return {
      kept: false,
      removedPaths
    };
  }

  return {
    kept: true,
    value: nextObject,
    removedPaths
  };
}

function collectSourceFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }

      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    const extension = path.extname(entry.name);

    if (!astExtensions.has(extension) && !textExtensions.has(extension)) {
      continue;
    }

    const stats = fs.statSync(absolutePath);

    if (stats.size > maxScanFileSize) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function collectUsedTranslationRefs(
  filePaths: string[],
  group: TranslationGroup,
  namespaceMap: Map<string, TranslationNamespace>
): Set<string> {
  const usedRefs = new Set<string>();
  const knownNamespaces = new Set(namespaceMap.keys());

  for (const filePath of filePaths) {
    const extension = path.extname(filePath);
    const sourceText = fs.readFileSync(filePath, 'utf8');

    if (textExtensions.has(extension)) {
      collectRefsFromText(sourceText, group.defaultNamespace, knownNamespaces).forEach((ref) =>
        usedRefs.add(ref)
      );
      continue;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath)
    );

    const translationBindings = new Map<string, string[]>();
    const translationObjectBindings = new Map<string, string[]>();
    const explicitNamespaceFns = new Set<string>();

    sourceFile.forEachChild((node) => {
      if (
        ts.isImportDeclaration(node) &&
        node.importClause &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const modulePath = node.moduleSpecifier.text;
        const namedBindings = node.importClause.namedBindings;

        if (!namedBindings || !ts.isNamedImports(namedBindings)) {
          return;
        }

        const isDocumentTImport = modulePath.includes('lib/i18n');
        const isI18nTImport =
          modulePath.includes('/i18n/utils') || modulePath.endsWith('/i18n/utils');

        namedBindings.elements.forEach((element) => {
          const importedName = (element.propertyName ?? element.name).text;
          const localName = element.name.text;

          if (isI18nTImport && importedName === 'i18nT') {
            explicitNamespaceFns.add(localName);
          }

          if (group.name === 'document' && isDocumentTImport && importedName === 't') {
            explicitNamespaceFns.add(localName);
          }
        });
      }
    });

    const visitSetup = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'useTranslation'
      ) {
        const namespaces = getUseTranslationNamespaces(node.initializer, group.defaultNamespace);

        if (ts.isObjectBindingPattern(node.name)) {
          node.name.elements.forEach((element) => {
            const propertyName = element.propertyName ?? element.name;

            if (
              ts.isIdentifier(propertyName) &&
              propertyName.text === 't' &&
              ts.isIdentifier(element.name)
            ) {
              translationBindings.set(element.name.text, namespaces);
            }
          });
        }

        if (ts.isIdentifier(node.name)) {
          translationObjectBindings.set(node.name.text, namespaces);
        }
      }

      ts.forEachChild(node, visitSetup);
    };

    visitSetup(sourceFile);

    const visitRefs = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callTarget = getCallTarget(
          node.expression,
          translationBindings,
          translationObjectBindings
        );
        const firstArg = node.arguments[0];
        const rawKey = firstArg ? getStaticStringValue(firstArg) : undefined;

        if (callTarget && rawKey) {
          const namespaces =
            callTarget.type === 'explicit'
              ? []
              : translationBindings.get(callTarget.name) ??
                translationObjectBindings.get(callTarget.name) ??
                [];

          parseTranslationRefs(rawKey, namespaces, group.defaultNamespace, knownNamespaces).forEach(
            (ref) => usedRefs.add(ref)
          );
        }
      }

      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'i18nKey') {
        const rawKey = getJsxAttributeStringValue(node);

        if (rawKey) {
          parseTranslationRefs(rawKey, [], group.defaultNamespace, knownNamespaces).forEach((ref) =>
            usedRefs.add(ref)
          );
        }
      }

      if (ts.isPropertyAssignment(node) && getPropertyNameText(node.name) === 'i18nKey') {
        const rawKey = getStaticStringValue(node.initializer);

        if (rawKey) {
          parseTranslationRefs(rawKey, [], group.defaultNamespace, knownNamespaces).forEach((ref) =>
            usedRefs.add(ref)
          );
        }
      }

      ts.forEachChild(node, visitRefs);
    };

    explicitNamespaceFns.forEach((name) => translationBindings.set(name, []));
    visitRefs(sourceFile);
  }

  return usedRefs;
}

function collectRefsFromText(
  text: string,
  defaultNamespace: string,
  knownNamespaces: Set<string>
): Set<string> {
  const refs = new Set<string>();
  const patterns = [
    /\bi18nT\(\s*(['"`])([^'"`]+)\1/g,
    /\bt\(\s*(['"`])([^'"`]+)\1/g,
    /\bi18nKey\s*=\s*\{?\s*(['"`])([^'"`]+)\1/g
  ];

  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const rawKey = match[2];

      parseTranslationRefs(rawKey, [], defaultNamespace, knownNamespaces).forEach((ref) =>
        refs.add(ref)
      );
    }
  });

  return refs;
}

function getCallTarget(
  expression: ts.LeftHandSideExpression,
  translationBindings: Map<string, string[]>,
  translationObjectBindings: Map<string, string[]>
):
  | {
      type: 'binding' | 'explicit';
      name: string;
    }
  | undefined {
  if (ts.isIdentifier(expression)) {
    if (!translationBindings.has(expression.text)) {
      return undefined;
    }

    return {
      type: 'binding',
      name: expression.text
    };
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.name.text === 't' &&
    translationObjectBindings.has(expression.expression.text)
  ) {
    return {
      type: 'binding',
      name: expression.expression.text
    };
  }

  return undefined;
}

function getUseTranslationNamespaces(
  callExpression: ts.CallExpression,
  defaultNamespace: string
): string[] {
  const [firstArg] = callExpression.arguments;

  if (!firstArg) {
    return [defaultNamespace];
  }

  const stringValue = getStaticStringValue(firstArg);

  if (stringValue) {
    return [stringValue];
  }

  if (ts.isArrayLiteralExpression(firstArg)) {
    const values = firstArg.elements
      .map((element) => getStaticStringValue(element))
      .filter((value): value is string => Boolean(value));

    return values.length > 0 ? values : [defaultNamespace];
  }

  return [defaultNamespace];
}

function parseTranslationRefs(
  rawKey: string,
  candidateNamespaces: string[],
  defaultNamespace: string,
  knownNamespaces: Set<string>
): string[] {
  if (!rawKey) {
    return [];
  }

  const firstColonIndex = rawKey.indexOf(':');

  if (firstColonIndex > 0) {
    const namespace = rawKey.slice(0, firstColonIndex);
    const keyPath = rawKey.slice(firstColonIndex + 1);

    if (!namespace || !keyPath || !knownNamespaces.has(namespace)) {
      return [];
    }

    return [toRef(namespace, keyPath)];
  }

  const namespaces = candidateNamespaces.length > 0 ? candidateNamespaces : [defaultNamespace];

  return namespaces
    .filter((namespace) => namespace && knownNamespaces.has(namespace))
    .map((namespace) => toRef(namespace, rawKey));
}

function getPropertyNameText(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }

  return undefined;
}

function getStaticStringValue(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
    return node.text;
  }

  if (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    return getStaticStringValue(node.expression);
  }

  if (ts.isTemplateExpression(node)) {
    if (node.templateSpans.length > 0) {
      return undefined;
    }

    return node.head.text;
  }

  return undefined;
}

function getJsxAttributeStringValue(node: ts.JsxAttribute): string | undefined {
  if (!node.initializer) {
    return undefined;
  }

  if (ts.isStringLiteral(node.initializer)) {
    return node.initializer.text;
  }

  if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
    return getStaticStringValue(node.initializer.expression);
  }

  return undefined;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath)) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function isPlainObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRef(namespace: string, keyPath: string) {
  return `${namespace}:${keyPath}`;
}

main();
