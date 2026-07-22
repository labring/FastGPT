import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import {
  SandboxGetHtmlPreviewLinkBodySchema,
  SandboxGetHtmlPreviewLinkResponseSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  createSandboxPreviewFileUrl,
  resolveSandboxPreviewPath,
  SandboxPreviewSessionLimitError
} from '@fastgpt/service/core/ai/sandbox/interface/preview';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import mime from 'mime';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { sourceType, sourceId, chatId, filePath, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxGetHtmlPreviewLinkBodySchema
  }).body;

  // 1. 鉴权
  const {
    uid,
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId
  } = await authSandboxSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: ReadPermissionVal
  });

  // 2. 只检查目标文件，不把 sandbox 内容复制到主站或对象存储。
  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId,
    userId: uid,
    chatId
  });
  const sandbox = await getSandboxClient(sandboxQuery);
  const providerPath = sandbox.resolveRuntimePath(filePath, { allowAbsolutePath: true });
  resolveSandboxPreviewPath(providerPath);
  const fileInfo = (await sandbox.provider.getFileInfo([providerPath])).get(providerPath);

  if (!fileInfo || fileInfo.isDirectory) {
    return jsonRes(res, { code: 400, message: 'HTML file does not exist' });
  }
  if (mime.getType(providerPath) !== 'text/html') {
    return jsonRes(res, { code: 400, message: 'File is not an HTML file' });
  }

  // 3. session 仅保存 sandbox 查询参数，provider endpoint 和内部口令由 proxy 按请求解析。
  const url = await (async () => {
    try {
      return SandboxGetHtmlPreviewLinkResponseSchema.parse(
        await createSandboxPreviewFileUrl({
          context: sandboxQuery,
          filePath: providerPath
        })
      );
    } catch (error) {
      if (error instanceof SandboxPreviewSessionLimitError) return null;
      throw error;
    }
  })();

  if (url === null) {
    return jsonRes(res, {
      code: 429,
      message: 'Too many active preview links for this sandbox'
    });
  }

  return jsonRes(res, {
    data: url
  });
}

export default NextAPI(handler);
