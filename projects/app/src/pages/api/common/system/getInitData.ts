import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetSystemInitDataQuerySchema,
  GetSystemInitDataResponseSchema,
  ProHealthResponseSchema,
  type GetSystemInitDataResponse
} from '@fastgpt/global/openapi/common/system/api';
import { getRuntimeSubPlansConfig } from '@fastgpt/global/support/wallet/sub/utils';
import { serviceEnv } from '@fastgpt/service/env';
import { postHealth } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getSsoConfigured } from '@fastgpt/service/common/system/sso';

const logger = getLogger(LogCategories.SYSTEM);

/** 按会话鉴权返回初始化数据；匿名白名单覆盖登录、价格和分享聊天的公共依赖。 */
async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<GetSystemInitDataResponse> {
  const { bufferId, includeSubPlans } = parseApiInput({
    req,
    querySchema: GetSystemInitDataQuerySchema
  }).query;
  // 展示可在 Pro 不可用时暂时隐藏入口；密码安全校验独立读取并拒绝未知状态。
  const ssoConfigured = await getSsoConfigured().catch(() => undefined);

  // 只有鉴权失败才降级为匿名响应，配置处理错误仍交给 API 中间件报告。
  const isAuthenticated = await authCert({ req, authToken: true })
    .then(() => true)
    .catch(() => false);
  // Pro 环境能力不写入 Mongo；只在登录态按需读取，避免启动迁移与 Pro 互相等待。
  const proFrontendCapabilities = await (async () => {
    if (!isAuthenticated || !serviceEnv.PRO_URL) return undefined;

    const disabled = {
      show_git: false,
      show_workorder: false,
      show_enterprise_auth: false,
      showWecomConfig: false
    };
    try {
      const health = ProHealthResponseSchema.safeParse(await postHealth({ timeout: 1500 }));
      if (health.success && health.data.auth === true && health.data.frontendCapabilities) {
        return health.data.frontendCapabilities;
      }
    } catch {
      // 连接失败和超时都只关闭展示入口；不记录可能携带凭据的请求错误。
    }
    logger.debug('Pro frontend capabilities unavailable');
    return disabled;
  })();

  // 所有异步探测完成后在同一同步帧快照全局状态，确保 feConfigs、subPlans 与 bufferId 来自同一次发布。
  const runtimeSnapshot = {
    feConfigs: global.feConfigs,
    subPlans: global.subPlans,
    systemVersion: global.systemVersion,
    systemInitBufferId: global.systemInitBufferId
  };
  const subPlans = getRuntimeSubPlansConfig(runtimeSnapshot.subPlans);

  /**
   * 登录后返回 Schema 声明的公开配置；匿名统一投影公共页面实际使用的字段。
   * 响应 Schema 同时过滤顶层及嵌套对象的未知字段，避免扩展配置泄漏。
   */
  const filterFeConfigs = (): GetSystemInitDataResponse['feConfigs'] => {
    // 存量库残留 sync 但 Pro 明确未配置外部用户系统地址时，与 Pro 保持一致降级为 single。
    const shouldDowngradeSyncTeamMode =
      runtimeSnapshot.feConfigs?.teamMode === 'sync' && ssoConfigured === false;
    const effectiveTeamMode = shouldDowngradeSyncTeamMode
      ? 'single'
      : runtimeSnapshot.feConfigs?.teamMode;
    const effectiveRegisterMethod = shouldDowngradeSyncTeamMode
      ? runtimeSnapshot.feConfigs?.register_method?.filter((method) => method !== 'sync')
      : runtimeSnapshot.feConfigs?.register_method;

    const config = {
      ...runtimeSnapshot.feConfigs,
      ...(effectiveTeamMode !== undefined ? { teamMode: effectiveTeamMode } : {}),
      ...(effectiveRegisterMethod !== undefined
        ? { register_method: effectiveRegisterMethod }
        : {}),
      // 每次响应直接读取环境变量，忽略文件、数据库和热更新配置中的同名字段。
      showAuxiliaryGenerationRunDetail: serviceEnv.AUXILIARY_GENERATION_SHOW_RUN_DETAIL,
      sso: (() => {
        if (!runtimeSnapshot.feConfigs?.sso && ssoConfigured !== true) return undefined;
        // 只信任 Pro 的部署能力，旧库地址和存储的前端能力标志都不是权威来源。
        return { ...runtimeSnapshot.feConfigs?.sso, enabled: ssoConfigured === true };
      })()
    };
    if (isAuthenticated) return config;

    const commonConfig = {
      systemTitle: config.systemTitle,
      favicon: config.favicon,
      scripts: config.scripts,
      isPlus: config.isPlus,
      // 共享布局、登录政策链接和插件模型参数帮助共用文档地址。
      docUrl: config.docUrl
    };
    const loginConfig = {
      login_method: config.login_method,
      register_method: config.register_method,
      find_password_method: config.find_password_method,
      loginGuideDocUrl: config.loginGuideDocUrl,
      chineseRedirectUrl: config.chineseRedirectUrl,
      wecomLoginAutoRedirect: config.wecomLoginAutoRedirect,
      sso: config.sso,
      oauth: config.oauth
    };
    const uploadConfig = {
      limit: config.limit && {
        uploadFileMaxAmount: config.limit?.uploadFileMaxAmount,
        uploadFileMaxSize: config.limit?.uploadFileMaxSize
      }
    };
    const chatConfig = {
      show_compliance_copywriting: config.show_compliance_copywriting,
      // 分享插件表单可选择模型，这个开关只控制系统模型标签的展示。
      enable_team_model: config.enable_team_model
    };

    // 所有匿名入口共用同一白名单，页面切换无需补取配置。
    return { ...commonConfig, ...loginConfig, ...uploadConfig, ...chatConfig };
  };
  const feConfigs = { ...filterFeConfigs(), ...proFrontendCapabilities };

  const response = (() => {
    if (isAuthenticated) {
      if (
        bufferId &&
        runtimeSnapshot.systemInitBufferId &&
        runtimeSnapshot.systemInitBufferId === bufferId
      ) {
        return {
          bufferId: runtimeSnapshot.systemInitBufferId,
          feConfigs,
          systemVersion: runtimeSnapshot.systemVersion,
          ...(includeSubPlans && { subPlans })
        };
      }

      return {
        bufferId: runtimeSnapshot.systemInitBufferId,
        feConfigs,
        subPlans,
        systemVersion: runtimeSnapshot.systemVersion
      };
    }

    // Pro 环境变化不改变 Mongo revision，必须把能力及不可用状态加入匿名缓存标识。
    const ssoVersion = ssoConfigured === undefined ? 'unavailable' : ssoConfigured ? '1' : '0';
    const unAuthBufferId = runtimeSnapshot.systemInitBufferId
      ? `unAuth_v10_sso_${ssoVersion}_${runtimeSnapshot.systemInitBufferId}`
      : '';
    if (bufferId && unAuthBufferId === bufferId) {
      return {
        bufferId: unAuthBufferId,
        ...(includeSubPlans && { subPlans })
      };
    }

    return {
      bufferId: unAuthBufferId,
      feConfigs,
      ...(includeSubPlans && { subPlans })
    };
  })();

  return GetSystemInitDataResponseSchema.parse(response);
}

export default NextAPI(handler);
