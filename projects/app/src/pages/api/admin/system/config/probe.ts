import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ProbeConnectionBodySchema,
  ProbeConnectionResponseSchema,
  type ProbeConnectionBody,
  type ProbeConnectionResponse,
  type ProbeConnectionService
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { probeUrlConnection } from '@fastgpt/service/common/system/systemInstanceConfig/probe';
import {
  findOverridesNotAllowedByEdition,
  getDomainConfig
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';

type SubserviceConfig = SystemInstanceConfigDomainMap['subservice'];
type SubserviceProbeEntry = {
  buildSubmittedOverrides: (body: ProbeConnectionBody) => Record<string, unknown>;
  getStoredToken?: (config: SubserviceConfig) => string;
};

const subserviceProbeConfigMap: Partial<Record<ProbeConnectionService, SubserviceProbeEntry>> = {
  codeSandbox: {
    buildSubmittedOverrides: (body) => ({
      codeSandbox: { url: body.url, token: body.token ?? '' }
    }),
    getStoredToken: (config) => config.codeSandbox.token
  },
  opensandbox: {
    buildSubmittedOverrides: (body) => ({
      agentSandbox: {
        opensandbox: { baseUrl: body.url, apiKey: body.token ?? '' }
      }
    }),
    getStoredToken: (config) => config.agentSandbox.opensandbox.apiKey
  },
  volumeManager: {
    buildSubmittedOverrides: (body) => ({
      agentSandbox: {
        opensandbox: { volumeManagerUrl: body.url, volumeManagerToken: body.token ?? '' }
      }
    }),
    getStoredToken: (config) => config.agentSandbox.opensandbox.volumeManagerToken
  },
  mcpSse: {
    buildSubmittedOverrides: (body) => ({ mcp: { sseProxyUrl: body.url } })
  },
  agentSandboxWsProxy: {
    buildSubmittedOverrides: (body) => ({ agentSandbox: { proxy: { wsUrl: body.url } } })
  },
  agentSandboxPreviewProxy: {
    buildSubmittedOverrides: (body) => ({ agentSandbox: { proxy: { previewUrl: body.url } } })
  }
};

/**
 * Admin API - 探测指定服务 URL 的网络连通性
 * 仅超级管理员 root 可触发，由后端直接发起 HTTP 探测。
 */
async function handler(
  req: ApiRequestProps<ProbeConnectionBody>
): Promise<ProbeConnectionResponse> {
  await authSystemAdmin({ req });

  const body = parseApiInput({
    req,
    bodySchema: ProbeConnectionBodySchema
  }).body;

  // 按与配置保存相同的版本边界检查，避免未来字段变为商业版专用后通过探测绕过。
  const subserviceEntry = body.service ? subserviceProbeConfigMap[body.service] : undefined;
  if (subserviceEntry) {
    const notAllowed = findOverridesNotAllowedByEdition({
      domain: 'subservice',
      submittedOverrides: subserviceEntry.buildSubmittedOverrides(body)
    });
    if (notAllowed.length > 0) {
      throw new ApiHttpError(403, 'Edition boundary violation for subservice probe');
    }
  }

  // 只在授权和版本检查后读取持久化凭据，表单空值则保持空值。
  const token =
    body.useStoredToken && subserviceEntry?.getStoredToken
      ? subserviceEntry.getStoredToken((await getDomainConfig('subservice')).effectiveConfig)
      : body.token;
  // 配置读取保留损坏凭据供修复；实际探测不能把残留密文对象当成认证 Token 发出。
  if (body.useStoredToken && subserviceEntry?.getStoredToken && typeof token !== 'string') {
    throw new ApiHttpError(
      400,
      body.service === 'codeSandbox'
        ? 'Invalid stored Code Sandbox credential'
        : 'Invalid stored subservice credential'
    );
  }
  const result = await probeUrlConnection({ ...body, token });

  return ProbeConnectionResponseSchema.parse(result);
}

export default NextAPI(handler);
