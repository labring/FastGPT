import { getDbRuntime, type DbRuntime } from './runtime';
import type { DbDialectFamily } from './types';

export type RepoProviders<TRepo extends object> = {
  mongo: () => TRepo;
  /** 统一覆盖 PostgreSQL、OceanBase、MySQL 等关系型方言实现。 */
  sql: () => TRepo;
};

export type LogRepoProviders<TRepo extends object> = {
  mongo: () => TRepo;
  sql: () => TRepo;
  /** 显式禁用日志库持久化（`logMode === 'disabled'`）时自动启用的 Null Object 空实现。 */
  noop: () => TRepo;
};

declare const repoTokenTypeBrand: unique symbol;

export type RepoToken<TRepo extends object> = {
  readonly [repoTokenTypeBrand]?: TRepo;
  readonly name: string;
  readonly kind: 'main' | 'log';
  readonly resolveFactory: (params: { family: DbDialectFamily; hasLogDb: boolean }) => () => TRepo;
};

/**
 * 定义主库领域仓储 DI Token。
 *
 * 仅登记 `mongo` 与 `sql` 两族方言的惰性构造工厂，模块加载阶段不会执行任何实例化或驱动初始化；
 * 运行时由容器根据 `runtime.family`（mongo vs postgres/oceanbase/mysql -> sql）自动路由。
 */
export const defineRepoToken = <TRepo extends object>(
  name: string,
  providers: RepoProviders<TRepo>
): RepoToken<TRepo> => ({
  name,
  kind: 'main',
  resolveFactory: ({ family }) => (family === 'sql' ? providers.sql : providers.mongo)
});

/**
 * 定义日志库领域仓储 DI Token。
 *
 * 日志数据源遵循三态拓扑：
 * - `separate`（配置了独立 `logWriteUrl`）：走独立日志连接池；
 * - `shared`（默认，未配置 `logWriteUrl` 且未显式禁用）：直接复用 `main` 连接池；
 * - `disabled`（显式 `logDisabled: true`，即 `hasLogDb === false`）：自动路由至 `noop` 空实现，
 *   消除业务层的 `if (hasLogDb)` 判断。
 */
export const defineLogRepoToken = <TRepo extends object>(
  name: string,
  providers: LogRepoProviders<TRepo>
): RepoToken<TRepo> => ({
  name,
  kind: 'log',
  resolveFactory: ({ family, hasLogDb }) => {
    if (!hasLogDb) {
      return providers.noop;
    }
    return family === 'sql' ? providers.sql : providers.mongo;
  }
});

const runtimeInstanceCache = new WeakMap<DbRuntime, Map<RepoToken<object>, object>>();
const testOverrideRegistry = new Map<RepoToken<object>, object>();

const resolveRepoInstance = <TRepo extends object>(token: RepoToken<TRepo>): TRepo => {
  const testOverride = testOverrideRegistry.get(token as RepoToken<object>);
  if (testOverride !== undefined) {
    return testOverride as TRepo;
  }

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

  const factory = token.resolveFactory({
    family: runtime.family,
    hasLogDb: runtime.hasLogDatabase()
  });
  const instance = factory();
  scopedMap.set(token as RepoToken<object>, instance);
  return instance;
};

/**
 * 注入由容器托管的惰性领域仓储代理。
 *
 * 返回的轻量 Proxy 在模块顶层 `import` 或 `new XxxService()` 阶段零副作用（兼容 Next.js 构建期与 HMR）；
 * 实际调用仓储方法时才按当前激活的 `DbRuntime` 懒实例化并绑定 `this` 上下文。
 */
export const injectRepo = <TRepo extends object>(token: RepoToken<TRepo>): TRepo =>
  new Proxy({} as TRepo, {
    get(_target, prop) {
      // 避免 Promise 自动展开（await proxy）或调试器/序列化探测符号时在 Runtime 初始化前误触发解析
      if (prop === 'then') {
        return undefined;
      }
      if (typeof prop === 'symbol') {
        if (prop === Symbol.toStringTag) {
          return `InjectedRepo(${token.name})`;
        }
        return undefined;
      }

      const instance = resolveRepoInstance(token);
      const value = Reflect.get(instance, prop, instance);
      if (typeof value === 'function') {
        return value.bind(instance);
      }
      return value;
    }
  });

/**
 * 测试辅助：在容器层临时覆盖指定 Token 的仓储实现（常规 Service 单测优先使用构造函数显式传参）。
 */
export const overrideRepoForTest = <TRepo extends object>(
  token: RepoToken<TRepo>,
  implementation: TRepo
): (() => void) => {
  testOverrideRegistry.set(token as RepoToken<object>, implementation);
  return () => {
    if (testOverrideRegistry.get(token as RepoToken<object>) === implementation) {
      testOverrideRegistry.delete(token as RepoToken<object>);
    }
  };
};

export const clearRepoOverrides = (): void => {
  testOverrideRegistry.clear();
};
