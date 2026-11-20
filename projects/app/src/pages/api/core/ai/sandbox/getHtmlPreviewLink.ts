import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getAuthorizedSandboxClient } from '@/service/core/sandbox/runtime';
import {
  SandboxGetHtmlPreviewLinkBodySchema,
  SandboxGetHtmlPreviewLinkResponseSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  createSandboxPreviewFileUrl,
  resolveSandboxPreviewPath,
  SandboxPreviewSessionLimitError
} from '@fastgpt/service/core/ai/sandbox/application/preview';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import mime from 'mime';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { customUid, authProxy, sourceType, sourceId, chatId, filePath, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxGetHtmlPreviewLinkBodySchema
    }).body;

  // 1. 鉴权并获取沙盒客户端，不把 sandbox 内容复制到主站或对象存储。
  const { sandboxQuery, sandbox } = await getAuthorizedSandboxClient({
    customUid,
    authProxy,
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: ReadPermissionVal
  });
  const runtimePath = sandbox.resolveRuntimePath(filePath, { allowAbsolutePath: true });
  const { providerPath, relativePath } = resolveSandboxPreviewPath(runtimePath);
  const fileInfo = (
    await sandbox.runWithRecovery(() => sandbox.opensandbox.getFileInfo([providerPath]))
  ).get(providerPath);

  if (!fileInfo || fileInfo.isDirectory) {
    return jsonRes(res, { code: 400, message: 'HTML file does not exist' });
  }
  if (mime.getType(providerPath) !== 'text/html') {
    return jsonRes(res, { code: 400, message: 'File is not an HTML file' });
  }

  // 3. session 仅保存 sandbox 查询参数，provider endpoint 和内部口令由 proxy 按请求解析。
  const url = await createSandboxPreviewFileUrl({
    context: sandboxQuery,
    relativePath
  }).catch((error) => {
    if (error instanceof SandboxPreviewSessionLimitError) return null;
    throw error;
  });

  if (url === null) {
    return jsonRes(res, {
      code: 429,
      message: 'Too many active preview links for this sandbox'
    });
  }

  return jsonRes(res, {
    data: SandboxGetHtmlPreviewLinkResponseSchema.parse(url)
  });
}

export default NextAPI(handler);
