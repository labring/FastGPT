import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { authSandboxRuntimeSession } from '@/service/core/sandbox/access';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SandboxUploadQuerySchema,
  SandboxUploadResponseSchema,
  type SandboxUploadQuery,
  type SandboxUploadResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getAgentSandboxMaxFileBytes } from '@fastgpt/service/core/ai/sandbox/interface/config';
import {
  buildSandboxClientQueryFromChatSource,
  getSandboxClient
} from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { prepareSandboxFileParentDirectories } from '@fastgpt/service/core/ai/sandbox/interface/file';
import { Readable } from 'node:stream';
import { createSizeLimitedStream } from '@fastgpt/service/common/file/stream';

async function handler(
  req: ApiRequestProps<unknown, SandboxUploadQuery>
): Promise<SandboxUploadResponse> {
  const { sourceType, sourceId, chatId, path, outLinkAuthData } = parseApiInput({
    req,
    querySchema: SandboxUploadQuerySchema
  }).query;

  const maxFileBytes = getAgentSandboxMaxFileBytes();
  const contentLengthHeader = req.headers['content-length'];
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  const createFileTooLargeError = (size: number) =>
    new Error(`File is too large (${size} bytes > ${maxFileBytes} bytes)`);

  if (contentLength !== undefined && contentLength > maxFileBytes) {
    throw createFileTooLargeError(contentLength);
  }

  const {
    uid,
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId
  } = await authSandboxRuntimeSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: WritePermissionVal
  });

  const sandbox = await getSandboxClient(
    buildSandboxClientQueryFromChatSource({
      sourceType: resolvedSourceType,
      sourceId: resolvedSourceId,
      userId: uid,
      chatId
    })
  );

  const providerPath = sandbox.resolveRuntimePath(path, { allowAbsolutePath: true });
  await prepareSandboxFileParentDirectories(sandbox.provider, [providerPath]);

  const boundedStream = createSizeLimitedStream({
    stream: req,
    maxBytes: maxFileBytes,
    createExceededError: createFileTooLargeError
  });
  const [writeResult] = await sandbox.provider.writeFiles([
    {
      path: providerPath,
      data: Readable.toWeb(boundedStream) as ReadableStream<Uint8Array>
    }
  ]);
  if (!writeResult || writeResult.error) {
    throw writeResult?.error ?? new Error('Sandbox did not return a file write result');
  }

  return SandboxUploadResponseSchema.parse({
    path,
    bytesWritten: writeResult.bytesWritten
  });
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
