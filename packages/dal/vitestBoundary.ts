import path from 'node:path';

const PRIVATE_DAL_REPO_IMPORT_RE =
  /^(?:@fastgpt|@)\/dal\/db\/repos\/.+\/(?:mongo|oceanbase)(?:\/|[?#]|$)/;
const BLOCKED_PRIVATE_DAL_REPO_PREFIX = '\0blocked-private-dal-repo:';
const RESOLVED_PRIVATE_DAL_REPO_PATH_RE =
  /(?:^|\/)(?:packages\/dal|pro\/admin\/src\/dal)\/db\/repos\/(.+?)\/(?:mongo|oceanbase)(?:\/|$)/;
const ALLOWED_REPO_CONTRACT_TEST_RE =
  /(?:^|\/)(?:packages\/dal\/test\/db|pro\/admin\/test\/dal\/db)\/repos\//;
const DAL_REPO_IMPORTER_RE = /(?:^|\/)(?:packages\/dal|pro\/admin\/src\/dal)\/db\/repos\/(.+)$/;

const stripQueryAndHash = (value: string): string =>
  value.replace(/[?#].*$/, '').replaceAll('\\', '/');

const isBlockedRelativeDalRepoImport = ({
  source,
  importer
}: {
  source: string;
  importer?: string;
}): boolean => {
  if (importer === undefined || (!source.startsWith('./') && !source.startsWith('../'))) {
    return false;
  }

  const cleanSource = stripQueryAndHash(source);
  const cleanImporter = stripQueryAndHash(importer);
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(cleanImporter), cleanSource)
  );
  const targetMatch = resolved.match(RESOLVED_PRIVATE_DAL_REPO_PATH_RE);
  if (targetMatch === null) {
    return false;
  }

  if (ALLOWED_REPO_CONTRACT_TEST_RE.test(cleanImporter)) {
    return false;
  }

  const targetDomain = targetMatch[1];
  const importerMatch = cleanImporter.match(DAL_REPO_IMPORTER_RE);
  const importerSubpath = importerMatch?.[1];
  if (
    importerSubpath === 'registry.ts' ||
    (importerSubpath !== undefined && importerSubpath.startsWith(`${targetDomain}/`))
  ) {
    return false;
  }

  return true;
};

/**
 * 共享 Vitest / Vite 插件：阻断通过 `@fastgpt`、`@` 别名或相对路径绕过
 * DAL 仓储边界直接引用私有 `mongo/*` 或 `oceanbase/*` 实现。
 *
 * 位于 `packages/dal/` 内以兼容独立 App Docker 构建上下文。
 */
export const blockPrivateDalRepoImports = () => ({
  name: 'fastgpt-block-private-dal-repo-imports',
  enforce: 'pre' as const,
  config: () => ({
    resolve: {
      alias: [
        {
          // Vite 内置 alias 插件早于 prePlugins 执行，需先重映射到私有标记前缀再于 resolveId 报错。
          find: PRIVATE_DAL_REPO_IMPORT_RE,
          replacement: `${BLOCKED_PRIVATE_DAL_REPO_PREFIX}$&`
        }
      ]
    }
  }),
  resolveId: (source: string, importer?: string) => {
    const blockedSpecifier = source.startsWith(BLOCKED_PRIVATE_DAL_REPO_PREFIX)
      ? source.slice(BLOCKED_PRIVATE_DAL_REPO_PREFIX.length)
      : PRIVATE_DAL_REPO_IMPORT_RE.test(source) ||
          isBlockedRelativeDalRepoImport({ source, importer })
        ? source
        : undefined;

    if (blockedSpecifier !== undefined) {
      throw new Error(
        `Blocked private DAL repository import "${blockedSpecifier}". ` +
          'Import the public repo token (".../repo") or contract types (".../repo.type") instead.'
      );
    }

    return null;
  }
});
