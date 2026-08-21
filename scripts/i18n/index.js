const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length !== 1 || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(args[0])) {
  console.error('Please provide a valid namespace. Usage: pnpm create:i18n <namespace>');
  process.exit(1);
}

const namespace = args[0];
const fileName = `${namespace}.json`;
const repositoryRoot = process.cwd();
const i18nPath = path.join(repositoryRoot, 'packages', 'web', 'i18n');
const localeTypePath = path.join(repositoryRoot, 'packages', 'global', 'common', 'i18n', 'type.ts');
const i18nextPath = path.join(i18nPath, 'i18next.ts');
const constantsPath = path.join(i18nPath, 'constants.ts');
const generatorPath = path.join(repositoryRoot, 'scripts', 'generate-i18n-resource-loaders.mjs');

const localeTypeSource = fs.readFileSync(localeTypePath, 'utf8');
const localeListSource = localeTypeSource.match(/LocaleList\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1];
if (!localeListSource) throw new Error('Unable to read LocaleList from i18n type.ts');
const languages = Array.from(localeListSource.matchAll(/'([^']+)'/g), (match) => match[1]);

for (const language of languages) {
  const filePath = path.join(i18nPath, language, fileName);
  if (fs.existsSync(filePath)) {
    console.log(`File already exists: ${filePath}`);
    continue;
  }

  fs.writeFileSync(filePath, '{}\n');
  console.log(`Created: ${filePath}`);
}

const importLine = `import type ${namespace} from './zh-CN/${fileName}';`;
let i18nextSource = fs.readFileSync(i18nextPath, 'utf8');
if (!i18nextSource.includes(importLine)) {
  i18nextSource = i18nextSource.replace("import 'i18next';", `import 'i18next';\n${importLine}`);
}
if (!new RegExp(`\\s${namespace}: typeof ${namespace};`).test(i18nextSource)) {
  i18nextSource = i18nextSource.replace(
    /(export interface I18nNamespaces \{[\s\S]*?)(\n\})/,
    `$1\n  ${namespace}: typeof ${namespace};$2`
  );
}
fs.writeFileSync(i18nextPath, i18nextSource);

let constantsSource = fs.readFileSync(constantsPath, 'utf8');
const namespaceListSource = constantsSource.match(/I18N_NAMESPACES\s*=\s*\[([\s\S]*?)\]/)?.[1];
if (!namespaceListSource) throw new Error('Unable to read I18N_NAMESPACES from constants.ts');
if (
  !Array.from(namespaceListSource.matchAll(/'([^']+)'/g), (match) => match[1]).includes(namespace)
) {
  constantsSource = constantsSource.replace(
    /(export const I18N_NAMESPACES = \[[\s\S]*?)(\n\];)/,
    (_match, listBody, listEnd) => `${listBody.trimEnd()},\n  '${namespace}'${listEnd}`
  );
  fs.writeFileSync(constantsPath, constantsSource);
}

execFileSync(process.execPath, [generatorPath], { stdio: 'inherit' });
