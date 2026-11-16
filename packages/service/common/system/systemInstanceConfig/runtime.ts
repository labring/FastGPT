import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { getLogger, LogCategories } from '../../logger';
import { logInstanceConfigRead } from '../migrationCoverageLog';
import { buildSystemFrontendConfig, type FrontendConfigContext } from './frontend';
import { getLicenseStatus } from '@fastgpt/global/common/system/license/utils';
import { createHash } from 'node:crypto';
import { serviceEnv } from '../../../env';
import { ProEnvConfigSchema } from '@fastgpt/global/common/system/config/proEnv';

const logger = getLogger(LogCategories.SYSTEM);

type RuntimeState = {
  frontendContext: FrontendConfigContext;
  rejectedLicense?: string;
};

/** 运行元数据跨 bundle 共用；只保存上下文和校验状态，不复制配置。 */
export const getSystemConfigRuntimeState = (): RuntimeState => {
  const store = globalThis as typeof globalThis & { systemConfigRuntimeState?: RuntimeState };
  return (store.systemConfigRuntimeState ??= { frontendContext: {} });
};

/** 授权校验结果绑定具体源；无原文的第三方授权使用缓存数据身份。 */
export const getLicenseSourceKey = (license: SystemInstanceConfig['license']) =>
  createHash('sha256')
    .update(
      license.license ? `raw:${license.license}` : `cache:${JSON.stringify(license.data ?? null)}`
    )
    .digest('hex');

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

type SystemInstanceConfigSnapshotListener = (snapshot: SystemInstanceConfig) => void;

/**
 * 订阅集合挂在 global 上：Next 的路由 bundle 可能各自加载一份本模块，
 * 模块级集合会让发布方（某个 route）与订阅方（另一个 route）互相看不到。
 */
const getSnapshotListeners = (): Set<SystemInstanceConfigSnapshotListener> => {
  const store = global as typeof global & {
    systemInstanceConfigListeners?: Set<SystemInstanceConfigSnapshotListener>;
  };
  store.systemInstanceConfigListeners ??= new Set();
  return store.systemInstanceConfigListeners;
};

/**
 * 订阅快照发布，用于「声明 applyMode: reload、但资源只能在创建时传入参数」的消费者
 * （典型是 BullMQ Worker 的 concurrency）。
 * 回调必须是同步、轻量、可重复执行；抛错只记录，不影响其它订阅者与发布本身。
 * @returns 取消订阅函数
 */
export const onSystemInstanceConfigSnapshot = (
  listener: SystemInstanceConfigSnapshotListener
): (() => void) => {
  const listeners = getSnapshotListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
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
  const state = getSystemConfigRuntimeState();
  // 社区版即便复用曾运行 Pro 的数据库，也不启用残留的部署能力、套餐或授权。
  // Pro 进程通过启动上下文声明自身商业服务能力，无需 PRO_URL 指向自己。
  const commercialService = state.frontendContext.commercialService ?? Boolean(serviceEnv.PRO_URL);
  const availableSnapshot = commercialService
    ? snapshot
    : {
        ...snapshot,
        proEnv: ProEnvConfigSchema.parse({}),
        commercial: { ...snapshot.commercial, subPlans: undefined },
        license: { ...snapshot.license, data: undefined }
      };
  const effectiveSnapshot =
    state.rejectedLicense === getLicenseSourceKey(availableSnapshot.license)
      ? { ...availableSnapshot, license: { ...availableSnapshot.license, data: undefined } }
      : availableSnapshot;
  // 候选解析及公开投影全部完成后再发布，不能让投影失败留下半份全局状态。
  const feConfigs = buildSystemFrontendConfig(effectiveSnapshot, state.frontendContext);
  global.systemInstanceConfig = effectiveSnapshot;
  global.feConfigs = feConfigs;
  if (versionTag !== undefined) {
    (global as any).systemInstanceConfigVersionTag = versionTag;
  }
  global.systemInitBufferId = `v_${versionTag ?? getInstanceConfigVersionTag()}_license_${getLicenseStatus(effectiveSnapshot.license.data)}`;

  // 订阅者用来重新绑定那些只在创建时接收参数的资源（如 Worker concurrency）。
  for (const listener of getSnapshotListeners()) {
    try {
      listener(effectiveSnapshot);
    } catch (error) {
      // 单个订阅者失败不能阻断配置发布或其它订阅者
      logger.error('Snapshot listener failed', { error });
    }
  }
};
