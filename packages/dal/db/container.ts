import { DbConfigurationError } from './errors';
import { getConfiguredDbRuntime, getDbRuntime, type DbRuntime } from './runtime';
import type { DbDialect } from './types';

export type RepoProviders<TRepo extends object> = {
  mongo: (runtime: DbRuntime) => TRepo;
  /** 仅已具备 OceanBase 实现的双引擎仓储提供；缺省表示该仓储目前仅驻留在 MongoDB。 */
  oceanbase?: (runtime: DbRuntime) => TRepo;
};

declare const repoTokenTypeBrand: unique symbol;

export type RepoToken<TRepo extends object> = {
  readonly [repoTokenTypeBrand]?: TRepo;
  readonly name: string;
  readonly supportsDialect: (dialect: DbDialect) => boolean;
  readonly resolveFactory: (dialect: DbDialect) => (runtime: DbRuntime) => TRepo;
};

/**
 * 定义领域仓储 DI Token（支持双引擎 `mongo` + `oceanbase` 或过渡期 `mongo` 专用声明）。
 * 模块加载期零副作用；运行时按 `DbRuntime` 生命周期缓存单例，混合模式下未实现 OceanBase 的
 * Mongo 专用仓储自动解析到伴生 Mongo `DbRuntime`，纯 OceanBase 模式保持 fail-closed。
 */
export const defineRepoToken = <TRepo extends object>(
  name: string,
  providers: RepoProviders<TRepo>
): RepoToken<TRepo> => ({
  name,
  supportsDialect: (dialect) =>
    dialect === 'oceanbase' ? providers.oceanbase !== undefined : true,
  resolveFactory: (dialect) => {
    if (dialect === 'oceanbase') {
      if (providers.oceanbase === undefined) {
        throw new DbConfigurationError(`OceanBase ${name} is not yet implemented`);
      }
      return providers.oceanbase;
    }
    return providers.mongo;
  }
});

const runtimeInstanceCache = new WeakMap<DbRuntime, Map<RepoToken<object>, object>>();

const resolveRepoInstance = <TRepo extends object>(token: RepoToken<TRepo>): TRepo => {
  const primary = getDbRuntime();
  let targetRuntime = primary;

  if (primary.dialect === 'oceanbase' && !token.supportsDialect('oceanbase')) {
    const fallbackMongo = getConfiguredDbRuntime('mongo');
    if (fallbackMongo === undefined) {
      throw new DbConfigurationError(`OceanBase ${token.name} is not yet implemented`);
    }
    targetRuntime = fallbackMongo;
  }

  let scopedMap = runtimeInstanceCache.get(targetRuntime);
  if (scopedMap === undefined) {
    scopedMap = new Map();
    runtimeInstanceCache.set(targetRuntime, scopedMap);
  }

  const cached = scopedMap.get(token as RepoToken<object>);
  if (cached !== undefined) {
    return cached as TRepo;
  }

  const factory = token.resolveFactory(targetRuntime.dialect);
  const instance = factory(targetRuntime);
  scopedMap.set(token as RepoToken<object>, instance);
  return instance;
};

/**
 * 注入由容器托管的惰性领域仓储代理（模块导入与 `new XxxService()` 阶段零副作用）。
 */
export const injectRepo = <TRepo extends object>(token: RepoToken<TRepo>): TRepo =>
  new Proxy({} as TRepo, {
    get(_target, prop) {
      if (prop === 'then') {
        return undefined;
      }
      if (typeof prop === 'symbol') {
        return prop === Symbol.toStringTag ? `InjectedRepo(${token.name})` : undefined;
      }

      const instance = resolveRepoInstance(token);
      const value = Reflect.get(instance, prop, instance);
      return typeof value === 'function' ? value.bind(instance) : value;
    }
  });
