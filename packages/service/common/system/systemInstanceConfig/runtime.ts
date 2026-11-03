import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { logInstanceConfigRead } from '../migrationCoverageLog';

/**
 * 实例配置运行时读取与快照发布。
 *
 * 这里只依赖 global 和配置 Schema 默认值，不导入 controller、Mongo 模型、事务或套餐逻辑，
 * 保证业务请求可以独立读取内存快照，而不携带管理端持久化依赖。
 */
/** 获取基于所有 Domain 文档当前 revision 聚合生成的确定性版本标识。 */
export const getInstanceConfigVersionTag = (): string =>
  (global as any).systemInstanceConfigVersionTag ?? '0';

/**
 * 统一计算系统全局初始化缓存标记（systemInitBufferId）。
 * 结合实例配置版本签名、授权版本时间戳和套餐版本时间戳，确保多节点确定性一致，
 * 避免不同节点各自使用 Date.now() 或各并行任务先后覆写产生竞态。
 */
export const computeSystemInitBufferId = ({
  instanceVersionTag = getInstanceConfigVersionTag(),
  licenseUpdateTime,
  subPlansUpdateTime
}: {
  instanceVersionTag?: string;
  licenseUpdateTime?: number;
  subPlansUpdateTime?: number;
} = {}): string => {
  const licenseTag = licenseUpdateTime ?? 0;
  const subPlansTag = subPlansUpdateTime ?? 0;
  return `v_${instanceVersionTag}_l_${licenseTag}_p_${subPlansTag}`;
};

/**
 * 同步获取当前内存中的系统实例配置快照。
 * 若尚未完成启动加载，则返回 Schema 定义的初始默认值，保证业务无锁直接调用且永不为 null。
 */
export const getSystemInstanceConfig = (): SystemInstanceConfig => {
  // global 是跨 Next bundle 的唯一快照源；模块级缓存会让已访问过的路由永久滞留旧配置。
  const snapshot = global.systemInstanceConfig ?? resolveSystemInstanceConfig({});
  global.systemInstanceConfig = snapshot;

  logInstanceConfigRead({
    callsite: 'runtime.systemInstanceConfig.getSystemInstanceConfig',
    fields: [],
    dedupe: true
  });
  return snapshot;
};

/**
 * 发布新的运行时快照和版本标记。
 * 由 reload 在数据库合成成功后调用；只更新 global，不发起数据库读取或业务刷新。
 */
export const publishSystemInstanceConfigSnapshot = ({
  snapshot,
  versionTag
}: {
  snapshot: SystemInstanceConfig;
  versionTag?: string;
}) => {
  global.systemInstanceConfig = snapshot;
  if (versionTag !== undefined) {
    (global as any).systemInstanceConfigVersionTag = versionTag;
  }
};
