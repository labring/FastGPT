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
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';

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
   * 登录后保留完整配置；匿名统一投影公共页面实际使用的字段。
   * 嵌套对象也逐项投影，避免扩展配置中的未知字段随整个对象下发。
   */
  const filterFeConfigs = (isAuthenticated: boolean): Partial<FastGPTFeConfigsType> => {
    const config = global.feConfigs;
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
      sso: config.sso && {
        icon: config.sso.icon,
        title: config.sso.title,
        url: config.sso.url,
        autoLogin: config.sso.autoLogin,
        disablePasswordForSsoUsers: config.sso.disablePasswordForSsoUsers
      },
      oauth: config.oauth && {
        github: config.oauth.github,
        google: config.oauth.google,
        wechat: config.oauth.wechat,
        wecom: config.oauth.wecom,
        microsoft: config.oauth.microsoft && {
          clientId: config.oauth.microsoft.clientId,
          tenantId: config.oauth.microsoft.tenantId,
          customButton: config.oauth.microsoft.customButton
        }
      }
    };
    const uploadConfig = {
      uploadFileMaxAmount: config.uploadFileMaxAmount,
      uploadFileMaxSize: config.uploadFileMaxSize
    };
    const chatConfig = {
      show_compliance_copywriting: config.show_compliance_copywriting,
      // 分享插件表单可选择模型，这个开关只控制系统模型标签的展示。
      enable_team_model: config.enable_team_model,
      agentSandboxProxyUrl: config.agentSandboxProxyUrl,
      limit: config.limit && {
        agentSandboxMaxFileBytes: config.limit.agentSandboxMaxFileBytes
      }
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

    // 仅套餐保留价格页兼容分支，feConfigs 始终使用统一匿名白名单。
    const needsSubPlans =
      includeSubPlans ??
      (() => {
        try {
          return new URL(req.headers.referer ?? '').pathname === '/price';
        } catch {
          return false;
        }
      })();
    if (needsSubPlans) return { feConfigs, subPlans };

    // 白名单改变时升级版本，强制旧匿名缓存重新获取过滤后的配置。
    const unAuthBufferId = global.systemInitBufferId
      ? `unAuth_v6_${global.systemInitBufferId}`
      : '';
    if (bufferId && unAuthBufferId === bufferId) {
      return {
        bufferId: unAuthBufferId
      };
    }

    return {
      bufferId: unAuthBufferId,
      feConfigs
    };
  })();

  return GetSystemInitDataResponseSchema.parse({ ...response, isAuthenticated });
}

export default NextAPI(handler);
