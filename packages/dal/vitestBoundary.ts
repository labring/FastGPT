import { isBlockedPrivateDalRepoImport, PRIVATE_DAL_REPO_ALIAS_RE } from './privateBoundary.mjs';

const BLOCKED_PRIVATE_DAL_REPO_PREFIX = '\0blocked-private-dal-repo:';

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
          find: PRIVATE_DAL_REPO_ALIAS_RE,
          replacement: `${BLOCKED_PRIVATE_DAL_REPO_PREFIX}$&`
        }
      ]
    }
  }),
  resolveId: (source: string, importer?: string) => {
    const blockedSpecifier = source.startsWith(BLOCKED_PRIVATE_DAL_REPO_PREFIX)
      ? source.slice(BLOCKED_PRIVATE_DAL_REPO_PREFIX.length)
      : isBlockedPrivateDalRepoImport({ source, importer })
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
