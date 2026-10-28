import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetSystemInitDataQuerySchema,
  GetSystemInitDataResponseSchema,
  type GetSystemInitDataResponse
} from '@fastgpt/global/openapi/common/system/api';
import { getRuntimeSubPlansConfig } from '@fastgpt/global/support/wallet/sub/utils';

/** 按会话鉴权返回初始化数据；匿名白名单覆盖登录、价格和分享聊天的公共依赖。 */
async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<GetSystemInitDataResponse> {
  const { bufferId, includeSubPlans } = parseApiInput({
    req,
    querySchema: GetSystemInitDataQuerySchema
  }).query;
  const subPlans = getRuntimeSubPlansConfig(global.subPlans);

  /**
   * 登录后返回 Schema 声明的公开配置；匿名统一投影公共页面实际使用的字段。
   * 响应 Schema 同时过滤顶层及嵌套对象的未知字段，避免扩展配置泄漏。
   */
  const filterFeConfigs = (isAuthenticated: boolean): GetSystemInitDataResponse['feConfigs'] => {
    const config = {
      ...global.feConfigs,
      sso: (() => {
        if (!global.feConfigs.sso && !global.systemEnv?.sso?.url) return undefined;
        // 地址及启用状态以服务端连接配置为准，不能信任存储的前端能力标志。
        return { ...global.feConfigs.sso, enabled: Boolean(global.systemEnv?.sso?.url) };
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

  // 只有鉴权失败才降级为匿名响应，配置处理错误仍交给 API 中间件报告。
  const isAuthenticated = await authCert({ req, authToken: true })
    .then(() => true)
    .catch(() => false);
  const feConfigs = filterFeConfigs(isAuthenticated);

  const response = (() => {
    if (isAuthenticated) {
      if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
        return {
          bufferId: global.systemInitBufferId,
          feConfigs,
          systemVersion: global.systemVersion,
          ...(includeSubPlans && { subPlans })
        };
      }

      return {
        bufferId: global.systemInitBufferId,
        feConfigs,
        subPlans,
        systemVersion: global.systemVersion
      };
    }

    // 白名单改变时升级版本，强制旧匿名缓存重新获取过滤后的配置。
    const unAuthBufferId = global.systemInitBufferId
      ? `unAuth_v9_${global.systemInitBufferId}`
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
