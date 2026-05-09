import path from 'node:path';

const quoteFiles = (files) =>
  files.map((file) => JSON.stringify(path.relative(process.cwd(), file))).join(' ');

const toAbsolutePath = (file) => (path.isAbsolute(file) ? file : path.resolve(process.cwd(), file));

const quoteDocumentFiles = (files) =>
  files
    .map((file) =>
      JSON.stringify(path.relative(path.join(process.cwd(), 'document'), toAbsolutePath(file)))
    )
    .join(' ');

const quoteDocumentArtifactPaths = () =>
  [
    'document/data/doc-last-modified.json',
    'document/content/toc.mdx',
    'document/content/toc.en.mdx'
  ]
    .map((file) => JSON.stringify(file))
    .join(' ');

const withoutTranslatedDocumentFiles = (files) =>
  files.filter((file) => {
    const documentPath = path.relative(path.join(process.cwd(), 'document'), toAbsolutePath(file));
    return !/\.[a-z]{2}\.mdx$/.test(documentPath);
  });

const withoutIgnoredPaths = (files) =>
  files.filter((file) => {
    const relativePath = path.relative(process.cwd(), file);

    return !(
      relativePath.startsWith('document/') ||
      relativePath.startsWith('projects/marketplace/') ||
      relativePath.startsWith('deploy/') ||
      relativePath.includes('/scripts/') ||
      relativePath.endsWith('/next-env.d.ts')
    );
  });

export default {
  './document/**/**/*.mdx': (files) => {
    if (files.length === 0) return [];

    const filenames = quoteDocumentFiles(files);
    const textlintFiles = withoutTranslatedDocumentFiles(files);
    const textlintFilenames = quoteDocumentFiles(textlintFiles);

    return [
      ...(textlintFiles.length > 0
        ? [`pnpm -C ./document exec textlint --fix ${textlintFilenames}`]
        : []),
      `pnpm -C ./document exec prettier --config ../.prettierrc.js --write ${filenames}`,
      ...(textlintFiles.length > 0
        ? [`pnpm -C ./document exec textlint ${textlintFilenames}`]
        : []),
      'pnpm -C ./document run initDocTime',
      'pnpm -C ./document run initDocToc',
      'pnpm -C ./document run checkDocRefs',
      'pnpm -C ./document run removeInvalidImg',
      `git add -- ${quoteDocumentArtifactPaths()}`,
      'git add -u -- document/public/imgs'
    ];
  },
  '**/*.{ts,tsx}': (files) => {
    const lintFiles = withoutIgnoredPaths(files);
    if (lintFiles.length === 0) return [];

    const filenames = quoteFiles(lintFiles);
    return [`eslint --fix ${filenames}`, `prettier --config ./.prettierrc.js --write ${filenames}`];
  },
  '**/*.scss': (files) => {
    if (files.length === 0) return [];

    const filenames = quoteFiles(files);
    return `prettier --config ./.prettierrc.js --write ${filenames}`;
  }
};
