import path from 'node:path';

const quoteFiles = (files) =>
  files.map((file) => JSON.stringify(path.relative(process.cwd(), file))).join(' ');

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
  './document/**/**/*.mdx': (files) =>
    files.length === 0
      ? []
      : [
        'pnpm -C ./document run format-doc',
        'pnpm -C ./document run initDocTime',
        'pnpm -C ./document run initDocToc',
        'pnpm -C ./document run checkDocRefs',
        'pnpm -C ./document run removeInvalidImg',
        'git add .'
      ],
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
