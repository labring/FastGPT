const PRIVATE_DAL_REPO_IMPORT_RE = /^@fastgpt\/dal\/db\/repos\/.+\/(?:mongo|sql)(?:\/|[?#]|$)/;
const BLOCKED_PRIVATE_DAL_REPO_PREFIX = '\0blocked-private-dal-repo:';

/**
 * 共享 Vitest / Vite 插件：阻断通过宽泛 `@fastgpt` 源码别名绕过
 * `packages/dal/package.json` `exports` 直接引用仓储私有 `mongo/*` 或 `sql/*` 路径。
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
  resolveId: (source: string) => {
    const blockedSpecifier = source.startsWith(BLOCKED_PRIVATE_DAL_REPO_PREFIX)
      ? source.slice(BLOCKED_PRIVATE_DAL_REPO_PREFIX.length)
      : PRIVATE_DAL_REPO_IMPORT_RE.test(source)
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
