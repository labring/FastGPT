import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { createHash } from 'node:crypto';
import { getLicenseStatus, isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import type { FrontendConfigContext } from './frontend';
import { buildSystemFrontendConfig } from './frontend';
import {
  getSystemInstanceConfig,
  getInstanceConfigVersionTag,
  getSystemConfigRuntimeState,
  getLicenseSourceKey,
  publishSystemInstanceConfigSnapshot
} from './runtime';
import type { batchUpdateDomainConfigs, getDomainConfigForAdmin } from './controller';
import type { startSystemConfigPolling } from './polling';
import type { ClientSession } from '../../mongo';

type UpdateConfigInput = Parameters<typeof batchUpdateDomainConfigs>[0];

/**
 * 配置的统一入口。同步方法只读取唯一 global 快照，异步命令才加载数据库依赖。
 * Pro 的验签、ENV 发布和第三方授权由 Pro 自身编排，不向共享层注入角色或业务实现。
 */
export class SystemInstanceConfigManager {
  private refreshQueue: Promise<unknown> = Promise.resolve();

  get(): SystemInstanceConfig {
    return getSystemInstanceConfig();
  }

  /** 初始化与普通刷新遵循同一默认值合成规则，不检查迁移状态。 */
  initialize() {
    return this.refresh();
  }

  /** 部署专有展示上下文仅更新白名单，不接收任意配置对象。 */
  setFrontendContext(context: FrontendConfigContext) {
    const state = getSystemConfigRuntimeState();
    state.frontendContext = { ...state.frontendContext, ...context };
  }

  /** 公开配置按返回时的时间重算授权状态，授权到期无需等待数据库 revision 改变。 */
  getClientConfig() {
    const snapshot = this.get();
    const feConfigs = buildSystemFrontendConfig(
      snapshot,
      getSystemConfigRuntimeState().frontendContext
    );
    return {
      feConfigs,
      version: `v_${getInstanceConfigVersionTag()}_license_${getLicenseStatus(snapshot.license.data)}_frontend_${createHash('sha256').update(JSON.stringify(feConfigs)).digest('hex').slice(0, 16)}`
    };
  }

  isLicenseActive(now = new Date()) {
    return isLicenseActive(this.get().license.data, now);
  }

  getLicenseStatus(now = new Date()) {
    return getLicenseStatus(this.get().license.data, now);
  }

  /** 串行读取及发布完整快照；失败不影响后续刷新，也不覆盖上一份有效配置。 */
  refresh(): Promise<SystemInstanceConfig> {
    const work = this.refreshQueue.then(async () => {
      const { getSystemInstanceConfigSnapshot } = await import('./controller');
      const { assertStorageDownloadConfig } = await import('../../s3/config/utils');
      const { snapshot, versionTag } = await getSystemInstanceConfigSnapshot();
      assertStorageDownloadConfig(snapshot.storage);
      publishSystemInstanceConfigSnapshot({ snapshot, versionTag });
      return this.get();
    });
    this.refreshQueue = work.catch(() => {});
    return work;
  }

  /** 保存结果来自事务提交值；本进程刷新失败不会把已提交的保存误报为失败。 */
  async update(input: UpdateConfigInput, session?: ClientSession) {
    const { batchUpdateDomainConfigs } = await import('./controller');
    return session ? batchUpdateDomainConfigs(input, session) : batchUpdateDomainConfigs(input);
  }

  /** 管理表单从主库取 overrides 和 revision，业务读取不使用此异步接口。 */
  async readForEdit(...args: Parameters<typeof getDomainConfigForAdmin>) {
    const { getDomainConfigForAdmin } = await import('./controller');
    return getDomainConfigForAdmin(...args);
  }

  /** 沿用进程级轮询；调用方仅提供本进程需重新应用的资源刷新，不注入配置来源。 */
  async startPolling(options: Parameters<typeof startSystemConfigPolling>[0]) {
    const { startSystemConfigPolling } = await import('./polling');
    return startSystemConfigPolling(options);
  }

  /** 已证实非法的授权只在本进程拒绝该源，后续轮询不能从旧 data 恢复授权。 */
  invalidateLicense(source?: string, expectedData?: SystemInstanceConfig['license']['data']) {
    const snapshot = this.get();
    const state = getSystemConfigRuntimeState();
    state.rejectedLicense = getLicenseSourceKey(
      source !== undefined || expectedData !== undefined
        ? { license: source, data: expectedData }
        : snapshot.license
    );
    if (getLicenseSourceKey(snapshot.license) !== state.rejectedLicense) return;
    publishSystemInstanceConfigSnapshot({
      snapshot: { ...snapshot, license: { ...snapshot.license, data: undefined } }
    });
  }

  /** 只有 Pro 成功验证同一来源后才清除拒绝状态；实际数据由后续整份刷新发布。 */
  acceptLicense(source?: string, expectedData?: SystemInstanceConfig['license']['data']) {
    const state = getSystemConfigRuntimeState();
    if (source !== undefined && state.rejectedLicense !== getLicenseSourceKey({ license: source }))
      return;
    if (
      expectedData !== undefined &&
      state.rejectedLicense !== getLicenseSourceKey({ data: expectedData })
    )
      return;
    state.rejectedLicense = undefined;
  }
}

const store = globalThis as typeof globalThis & {
  systemInstanceConfigManager?: SystemInstanceConfigManager;
};

/** 同一进程跨 Next bundle 共用管理器和队列。 */
export const systemInstanceConfig = (store.systemInstanceConfigManager ??=
  new SystemInstanceConfigManager());
