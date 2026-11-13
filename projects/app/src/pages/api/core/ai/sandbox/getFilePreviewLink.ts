import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import {
  SandboxGetFilePreviewLinkBodySchema,
  SandboxGetFilePreviewLinkResponseSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  createSandboxPreviewFileUrl,
  resolveSandboxPreviewFiles,
  SandboxPreviewFileNotFoundError,
  SandboxPreviewPathAccessError,
  SandboxPreviewSessionLimitError
} from '@fastgpt/service/core/ai/sandbox/application/preview';
import { SANDBOX_PREVIEW_SESSION_TTL_SECONDS } from '@fastgpt/service/core/ai/sandbox/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

/**
 * 签发通用文件的短期预览 URL，媒体直接由代理按 Range 读取，主站不缓存文件内容。
 * 预览链接免登录，签发前按路径校验落在 `/workspace` 内，与边缘 `opensandbox-proxy` 边界保持一致。
 */
async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { customUid, authProxy, sourceType, sourceId, chatId, filePath, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxGetFilePreviewLinkBodySchema
    }).body;

  await withAuthorizedSandboxClient(
    {
      customUid,
      authProxy,
      req,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData,
      per: ReadPermissionVal
    },
    async ({ sandbox, sandboxQuery }) => {
      try {
        const [{ relativePath }] = await resolveSandboxPreviewFiles({
          sandbox,
          paths: [filePath]
        });

        // 在创建 token 前计算保守过期时间，客户端复用链接不会因签发耗时而超过 Redis TTL。
        const expiresAt = Date.now() + SANDBOX_PREVIEW_SESSION_TTL_SECONDS * 1000;
        const url = await createSandboxPreviewFileUrl({
          context: sandboxQuery,
          relativePath
        });
        return jsonRes(res, {
          data: SandboxGetFilePreviewLinkResponseSchema.parse({ url, expiresAt })
        });
      } catch (error) {
        if (error instanceof SandboxPreviewPathAccessError) {
          return jsonRes(res, {
            code: 403,
            message: 'Sandbox file is outside the previewable directory'
          });
        }
        if (error instanceof SandboxPreviewFileNotFoundError) {
          return jsonRes(res, { code: 400, message: 'Sandbox file does not exist' });
        }
        if (error instanceof SandboxPreviewSessionLimitError) {
          return jsonRes(res, {
            code: 429,
            message: 'Too many active preview links for this sandbox'
          });
        }
        throw error;
      }
    }
  );
}

export default NextAPI(handler);
