import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type IconEntry = {
  key: string;
  importPath: string;
  assetPath: string;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const constantsFile = path.join(repoRoot, 'packages/web/components/common/Icon/constants.ts');
const iconDir = path.join(repoRoot, 'packages/web/components/common/Icon/icons');
const scanRoots = ['packages', 'projects', 'scripts'].map((dir) => path.join(repoRoot, dir));
const ignoredDirs = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out'
]);
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const maxScanFileSize = 512 * 1024;

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const isDryRun = !shouldWrite;

function main() {
  if (!fs.existsSync(constantsFile)) {
    throw new Error(`Icon constants file not found: ${constantsFile}`);
  }

  const iconEntries = parseIconEntries(constantsFile);

  if (iconEntries.length === 0) {
    throw new Error(`No icon entries found in: ${constantsFile}`);
  }

  const iconKeySet = new Set(iconEntries.map((entry) => entry.key));
  const sourceFiles = scanRoots.flatMap((root) => collectSourceFiles(root));
  const usedKeys = collectUsedIconKeys(sourceFiles, iconKeySet);
  const unusedEntries = iconEntries.filter((entry) => !usedKeys.has(entry.key));
  const keptEntries = iconEntries.filter((entry) => usedKeys.has(entry.key));
  const removableAssets = getRemovableAssets(iconEntries, unusedEntries);

  console.log(
    `[${isDryRun ? 'dry-run' : 'write'}] scanned ${sourceFiles.length} files, found ${usedKeys.size}/${iconEntries.length} used icon keys`
  );

  if (unusedEntries.length === 0) {
    console.log('No unused icon keys found.');
    return;
  }

  console.log(`Unused icon keys (${unusedEntries.length}):`);
  unusedEntries.forEach((entry) => {
    console.log(`- ${entry.key} -> ${path.relative(repoRoot, entry.assetPath)}`);
  });

  console.log(`Unused icon assets that can be removed (${removableAssets.length}):`);
  removableAssets.forEach((assetPath) => {
    console.log(`- ${path.relative(repoRoot, assetPath)}`);
  });

  if (isDryRun) {
    console.log('Run with --write to update constants.ts and delete the unused icon assets.');
    return;
  }

  fs.writeFileSync(constantsFile, buildConstantsFile(keptEntries), 'utf8');

  removableAssets.forEach((assetPath) => {
    if (fs.existsSync(assetPath)) {
      fs.rmSync(assetPath);
    }
  });

  console.log(`Updated ${path.relative(repoRoot, constantsFile)}.`);
}

function parseIconEntries(filePath: string): IconEntry[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const iconPathsObject = findIconPathsObject(sourceFile);

  if (!iconPathsObject) {
    throw new Error(`Could not find export const iconPaths in: ${filePath}`);
  }

  return iconPathsObject.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return [];
    }

    const key = getPropertyName(property.name);
    const importPath = getImportPathFromInitializer(property.initializer);

    if (!key || !importPath) {
      return [];
    }

    return [
      {
        key,
        importPath,
        assetPath: path.resolve(path.dirname(filePath), importPath)
      }
    ];
  });
}

function findIconPathsObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  let iconPathsObject: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'iconPaths' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      iconPathsObject = node.initializer;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return iconPathsObject;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }

  return undefined;
}

function getImportPathFromInitializer(initializer: ts.Expression): string | undefined {
  const expression = unwrapExpression(initializer);

  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return undefined;
  }

  if (ts.isBlock(expression.body)) {
    for (const statement of expression.body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression) {
        return getImportPathFromExpression(statement.expression);
      }
    }

    return undefined;
  }

  return getImportPathFromExpression(expression.body);
}

function getImportPathFromExpression(expression: ts.Expression): string | undefined {
  const target = unwrapExpression(expression);

  if (!ts.isCallExpression(target) || target.expression.kind !== ts.SyntaxKind.ImportKeyword) {
    return undefined;
  }

  const [firstArg] = target.arguments;

  if (!firstArg || !ts.isStringLiteralLike(firstArg)) {
    return undefined;
  }

  return firstArg.text;
}

function unwrapExpression<T extends ts.Expression>(expression: T): ts.Expression {
  let current: ts.Expression = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
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

    if (absolutePath === constantsFile) {
      continue;
    }

    if (!allowedExtensions.has(path.extname(entry.name))) {
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

function collectUsedIconKeys(filePaths: string[], iconKeySet: Set<string>): Set<string> {
  const usedKeys = new Set<string>();

  for (const filePath of filePaths) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath)
    );

    const visit = (node: ts.Node) => {
      if (
        (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        iconKeySet.has(node.text)
      ) {
        usedKeys.add(node.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return usedKeys;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath);

  switch (extension) {
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

function getRemovableAssets(allEntries: IconEntry[], unusedEntries: IconEntry[]): string[] {
  const unusedKeySet = new Set(unusedEntries.map((entry) => entry.key));
  const assetUsage = new Map<string, IconEntry[]>();

  allEntries.forEach((entry) => {
    const entries = assetUsage.get(entry.assetPath) ?? [];
    entries.push(entry);
    assetUsage.set(entry.assetPath, entries);
  });

  return Array.from(assetUsage.entries())
    .filter(([assetPath, entries]) => {
      if (!assetPath.startsWith(iconDir)) {
        return false;
      }

      return entries.every((entry) => unusedKeySet.has(entry.key));
    })
    .map(([assetPath]) => assetPath)
    .sort();
}

function buildConstantsFile(entries: IconEntry[]): string {
  const lines = entries.map((entry) => {
    return `  ${formatObjectKey(entry.key)}: () => import('${entry.importPath}'),`;
  });

  return `// @ts-nocheck

export const iconPaths = {
${lines.join('\n')}
};
`;
}

function formatObjectKey(key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return key;
  }

  return `'${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

main();
