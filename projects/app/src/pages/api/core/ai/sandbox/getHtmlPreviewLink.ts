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
  resolveSandboxPreviewPath
} from '@fastgpt/service/core/ai/sandbox/application/preview';
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
    teamId,
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
  const sandbox = await getSandboxClient(
    buildSandboxClientQueryFromChatSource({
      sourceType: resolvedSourceType,
      sourceId: resolvedSourceId,
      userId: uid,
      chatId
    })
  );
  const providerPath = sandbox.resolveRuntimePath(filePath, { allowAbsolutePath: true });
  resolveSandboxPreviewPath(providerPath);
  const fileInfo = (await sandbox.provider.getFileInfo([providerPath])).get(providerPath);

  if (!fileInfo || fileInfo.isDirectory) {
    return jsonRes(res, { code: 400, message: 'HTML file does not exist' });
  }
  if (mime.getType(providerPath) !== 'text/html') {
    return jsonRes(res, { code: 400, message: 'File is not an HTML file' });
  }

  // 3. token 仅描述 sandbox 归属，provider endpoint 和内部口令由 proxy 按请求解析。
  const url = SandboxGetHtmlPreviewLinkResponseSchema.parse(
    createSandboxPreviewFileUrl({
      context: {
        sourceType: resolvedSourceType,
        sourceId: resolvedSourceId,
        userId: uid,
        chatId,
        teamId
      },
      filePath: providerPath
    })
  );

  return jsonRes(res, {
    data: url
  });
}

export default NextAPI(handler);
