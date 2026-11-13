import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import { jsonRes } from '@fastgpt/service/common/response';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SandboxUploadQuerySchema,
  SandboxUploadResponseSchema,
  type SandboxUploadQuery,
  type SandboxUploadResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getAgentSandboxMaxFileBytes } from '@fastgpt/service/core/ai/sandbox/config';
import {
  SandboxFileConflictError,
  writeSandboxSessionFile
} from '@fastgpt/service/core/ai/sandbox/application/file';

/**
 * 流式上传或保存沙盒会话文件（关闭 Next.js 默认 `bodyParser`）。
 *
 * 在鉴权前先拦截超限的 `Content-Length`，写入过程中由 `writeSandboxSessionFile` 校验实际流式字节数与可选 `oldEtag` 乐观锁；
 * 当发生乐观并发冲突（`SandboxFileConflictError`）时按 `409` 用户侧冲突返回，避免记为 500 系统异常。
 */
async function handler(
  req: ApiRequestProps<unknown, SandboxUploadQuery>,
  res: NextApiResponse
): Promise<SandboxUploadResponse | void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return jsonRes(res, { code: 405, message: 'Method Not Allowed' });
  }

  const { customUid, authProxy, sourceType, sourceId, chatId, path, oldEtag, outLinkAuthData } =
    parseApiInput({
      req,
      querySchema: SandboxUploadQuerySchema
    }).query;

  const maxFileBytes = getAgentSandboxMaxFileBytes();
  const contentLengthHeader = req.headers['content-length'];
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  if (contentLength !== undefined && contentLength > maxFileBytes) {
    throw new Error(`File is too large (${contentLength} bytes > ${maxFileBytes} bytes)`);
  }

  return withAuthorizedSandboxClient(
    {
      customUid,
      authProxy,
      req,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData,
      per: WritePermissionVal
    },
    async ({ sandbox }) => {
      const controller = new AbortController();
      const onAborted = () => controller.abort(new Error('Sandbox file upload aborted'));
      req.once('aborted', onAborted);
      if (req.aborted) onAborted();
      try {
        const result = await writeSandboxSessionFile(sandbox, {
          path,
          stream: req,
          oldEtag,
          maxFileBytes,
          signal: controller.signal
        });
        return SandboxUploadResponseSchema.parse({ path, ...result });
      } catch (error) {
        if (error instanceof SandboxFileConflictError) {
          return jsonRes(res, { code: 409, error: new UserError(error.message) });
        }
        throw error;
      } finally {
        req.off('aborted', onAborted);
      }
    }
  );
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
