import path from 'node:path';

export const PRIVATE_DAL_REPO_ALIAS_RE =
  /^(?:@fastgpt|@)\/dal\/db\/repos\/.+\/(?:mongo|oceanbase)(?:\/|[?#]|$)/;

const NORMALIZED_PRIVATE_DAL_REPO_ALIAS_RE =
  /^(?:@fastgpt|@)\/dal\/db\/repos\/.+\/(?:mongo|oceanbase)(?:\/|$)/;
const RESOLVED_PRIVATE_DAL_REPO_PATH_RE =
  /(?:^|\/)(packages\/dal|pro\/admin\/src\/dal)\/db\/repos\/(.+?)\/(?:mongo|oceanbase)(?:\/|$)/;
const DAL_REPO_IMPORTER_RE = /(?:^|\/)(packages\/dal|pro\/admin\/src\/dal)\/db\/repos\/(.+)$/;
const CORE_CONTRACT_TEST_RE = /(?:^|\/)packages\/dal\/test\/db\/repos\//;
const PRO_CONTRACT_TEST_RE = /(?:^|\/)pro\/admin\/test\/dal\/db\/repos\//;
const SUBPATH_IN_BACKEND_DIR_RE = /^(.+?)\/(?:mongo|oceanbase)(?:\/|$)/;
const WINDOWS_ABS_PATH_RE = /^[a-zA-Z]:\//;

const stripQueryAndHash = (value) => value.replace(/[?#].*$/, '').replaceAll('\\', '/');

/**
 * 从 `db/repos/<domain>/...` 子路径中提取精确的仓储根路径（如 `app` 或 `app/version`）。
 * 禁止使用 `startsWith` 前缀匹配，避免父仓储（`app`）与独立子仓储（`app/version`）互相越界。
 *
 * @param {string} subpath
 * @returns {string | undefined}
 */
const getRepoRootFromSubpath = (subpath) => {
  const backendMatch = subpath.match(SUBPATH_IN_BACKEND_DIR_RE);
  if (backendMatch !== null) {
    return backendMatch[1];
  }

  const dir = path.posix.dirname(subpath);
  return dir === '.' ? undefined : dir;
};

/**
 * 判定给定 `cleanImporter` 是否有权导入目标作用域下的私有仓储实现。
 *
 * @param {{ cleanImporter: string | undefined; targetScope: string; targetDomain: string }} params
 * @returns {boolean}
 */
const isAuthorizedPrivateDalRepoImporter = ({ cleanImporter, targetScope, targetDomain }) => {
  if (cleanImporter === undefined) {
    return false;
  }

  if (targetScope === 'packages/dal' && CORE_CONTRACT_TEST_RE.test(cleanImporter)) {
    return true;
  }

  if (targetScope === 'pro/admin/src/dal' && PRO_CONTRACT_TEST_RE.test(cleanImporter)) {
    return true;
  }

  const importerMatch = cleanImporter.match(DAL_REPO_IMPORTER_RE);
  if (importerMatch === null) {
    return false;
  }

  const importerScope = importerMatch[1];
  const importerSubpath = importerMatch[2];
  if (importerScope !== targetScope) {
    return false;
  }

  if (importerSubpath === 'registry.ts') {
    return true;
  }

  const importerDomain = getRepoRootFromSubpath(importerSubpath);
  return importerDomain !== undefined && importerDomain === targetDomain;
};

/**
 * 统一判定模块说明符是否构成越界导入 DAL 仓储私有 `mongo/*` 或 `oceanbase/*` 实现。
 * 供 Vitest Resolver 插件、根 `eslint.config.mjs` 与 CI 静态 AST 门禁共享同一规则。
 *
 * @param {{ source: string; importer?: string }} params
 * @returns {boolean}
 */
export const isBlockedPrivateDalRepoImport = ({ source, importer }) => {
  const cleanSource = stripQueryAndHash(source);

  // 1. `@fastgpt/*` 与 `@/*` 别名路径一律不允许访问私有 `mongo`/`oceanbase` 实现（含路径回溯逃逸）。
  if (cleanSource.startsWith('@fastgpt/') || cleanSource.startsWith('@/')) {
    const normalizedAlias = path.posix.normalize(cleanSource);
    if (normalizedAlias.startsWith('@fastgpt/') || normalizedAlias.startsWith('@/')) {
      return NORMALIZED_PRIVATE_DAL_REPO_ALIAS_RE.test(normalizedAlias);
    }
    return RESOLVED_PRIVATE_DAL_REPO_PATH_RE.test(normalizedAlias);
  }

  // 2. 相对路径与绝对路径按调用方文件归一化到真实路径后再校验同域根与作用域隔离。
  const cleanImporter = importer !== undefined ? stripQueryAndHash(importer) : undefined;
  const resolvedTarget = (() => {
    if (cleanSource.startsWith('./') || cleanSource.startsWith('../')) {
      if (cleanImporter === undefined) {
        return undefined;
      }
      return path.posix.normalize(path.posix.join(path.posix.dirname(cleanImporter), cleanSource));
    }
    if (cleanSource.startsWith('/') || WINDOWS_ABS_PATH_RE.test(cleanSource)) {
      return path.posix.normalize(cleanSource);
    }
    return undefined;
  })();

  if (resolvedTarget === undefined) {
    return false;
  }

  const targetMatch = resolvedTarget.match(RESOLVED_PRIVATE_DAL_REPO_PATH_RE);
  if (targetMatch === null) {
    return false;
  }

  const targetScope = targetMatch[1];
  const targetDomain = targetMatch[2];
  return !isAuthorizedPrivateDalRepoImporter({
    cleanImporter,
    targetScope,
    targetDomain
  });
};
