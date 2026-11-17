import { SYSTEM_INSTANCE_CONFIG_SCOPES } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from './schema';
import { getLogger, LogCategories } from '../../logger';

type ScopeVersions = Record<string, string>;
type ConfigPoller = { stop: () => Promise<void> };

/** 只从主库批量读取版本元数据；文档身份参与比较，删除后同 revision 重建也能被发现。 */
export const readSystemConfigScopeVersions = async (): Promise<ScopeVersions> => {
  const docs = await MongoSystemInstanceConfig.find(
    { domain: { $in: SYSTEM_INSTANCE_CONFIG_SCOPES } },
    { _id: 1, domain: 1, revision: 1 }
  )
    .read('primary')
    .lean();
  return Object.fromEntries(docs.map((doc) => [doc.domain, `${doc._id}:${doc.revision ?? 0}`]));
};

/**
 * 每个进程/角色只注册一条配置轮询，跨 Next bundle 的重复注册复用 global 中的任务。
 * 首轮强制加载，后续逐 scope 比较版本；刷新成功才确认所观察的版本。
 * 刷新期间发生的修改会在下一轮再次发现，失败不丢更新。每轮结束后再等待 1 秒，避免重叠。
 * 返回停止函数供进程生命周期和测试关闭；停止时等待当前刷新完成，不再发起新读取。
 */
export const startSystemConfigPolling = ({
  key,
  refresh,
  isReady,
  readAuxiliaryVersions
}: {
  key: 'app' | 'pro';
  refresh: (context: { changedScopes: string[]; initialLoad: boolean }) => Promise<void>;
  isReady?: () => Promise<boolean>;
  /** 可选的外部状态参与变更检测；读取失败不阻止配置刷新，下轮继续重试。 */
  readAuxiliaryVersions?: () => Promise<ScopeVersions>;
}): (() => Promise<void>) => {
  const store = global as typeof global & { systemConfigPollers?: Map<string, ConfigPoller> };
  const pollers = (store.systemConfigPollers ??= new Map());
  const previous = pollers.get(key);
  if (previous) return previous.stop;

  const logger = getLogger(LogCategories.SYSTEM);
  let stopped = false;
  let appliedVersions: ScopeVersions | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;

  /** 可被 stop 提前唤醒；unref 避免轮询计时器单独阻止进程退出。 */
  const wait = () =>
    new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(() => {
        wake = undefined;
        resolve();
      }, 1000);
      timer.unref?.();
    });

  const run = async () => {
    while (!stopped) {
      try {
        const ready = !isReady || (await isReady());
        if (!stopped && ready) {
          const versions = await readSystemConfigScopeVersions();
          if (readAuxiliaryVersions) {
            try {
              Object.assign(versions, await readAuxiliaryVersions());
            } catch (error) {
              // 保留上次辅助状态，避免短暂故障被误认成状态删除，也不阻挡 scope 变更。
              for (const [scope, version] of Object.entries(appliedVersions ?? {})) {
                if (scope.startsWith('migration:')) versions[scope] = version;
              }
              logger.warn('Failed to read auxiliary config polling metadata', { key, error });
            }
          }
          const scopes = new Set([...Object.keys(appliedVersions ?? {}), ...Object.keys(versions)]);
          const changedScopes = [...scopes].filter(
            (scope) => versions[scope] !== appliedVersions?.[scope]
          );
          if (!stopped && (appliedVersions === undefined || changedScopes.length > 0)) {
            await refresh({ changedScopes, initialLoad: appliedVersions === undefined });
            appliedVersions = versions;
          }
        }
      } catch (error) {
        logger.error('System config polling failed; retrying in one second', { key, error });
      }
      if (!stopped) await wait();
    }
  };

  const poller: ConfigPoller = {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await done;
      if (pollers.get(key) === poller) pollers.delete(key);
    }
  };
  pollers.set(key, poller);
  const done = run();
  return poller.stop;
};
