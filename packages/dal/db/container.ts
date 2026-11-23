import { getDbRuntime, type DbRuntime } from './runtime';
import type { DbDialect } from './types';

export type RepoProviders<TRepo extends object> = {
  mongo: (runtime: DbRuntime) => TRepo;
  oceanbase: (runtime: DbRuntime) => TRepo;
};

declare const repoTokenTypeBrand: unique symbol;

export type RepoToken<TRepo extends object> = {
  readonly [repoTokenTypeBrand]?: TRepo;
  readonly name: string;
  readonly resolveFactory: (dialect: DbDialect) => (runtime: DbRuntime) => TRepo;
};

/**
 * 定义领域仓储 DI Token（1 对 1 映射 `mongo` 与 `oceanbase` 两套实现）。
 * 模块加载期零副作用；运行时按 `runtime.dialect` 懒解析并按 `DbRuntime` 生命周期缓存单例。
 */
export const defineRepoToken = <TRepo extends object>(
  name: string,
  providers: RepoProviders<TRepo>
): RepoToken<TRepo> => ({
  name,
  resolveFactory: (dialect) => (dialect === 'oceanbase' ? providers.oceanbase : providers.mongo)
});

const runtimeInstanceCache = new WeakMap<DbRuntime, Map<RepoToken<object>, object>>();

const resolveRepoInstance = <TRepo extends object>(token: RepoToken<TRepo>): TRepo => {
  const runtime = getDbRuntime();
  let scopedMap = runtimeInstanceCache.get(runtime);
  if (scopedMap === undefined) {
    scopedMap = new Map();
    runtimeInstanceCache.set(runtime, scopedMap);
  }

  const cached = scopedMap.get(token as RepoToken<object>);
  if (cached !== undefined) {
    return cached as TRepo;
  }

  const factory = token.resolveFactory(runtime.dialect);
  const instance = factory(runtime);
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
