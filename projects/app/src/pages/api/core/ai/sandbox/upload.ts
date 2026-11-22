import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getAuthorizedSandboxClient } from '@/service/core/sandbox/runtime';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';
import {
  SandboxUploadQuerySchema,
  SandboxUploadResponseSchema,
  type SandboxUploadQuery,
  type SandboxUploadResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getAgentSandboxDiskBytes } from '@fastgpt/service/core/ai/sandbox/config';
import { assertSandboxWorkspaceWritable } from '@fastgpt/service/core/ai/sandbox/application/quota';
import { prepareSandboxFileParentDirectories } from '@fastgpt/service/core/ai/sandbox/application/file';
import { Readable } from 'node:stream';
import { createSizeLimitedStream } from '@fastgpt/service/common/file/stream';

async function handler(
  req: ApiRequestProps<unknown, SandboxUploadQuery>
): Promise<SandboxUploadResponse> {
  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      querySchema: SandboxUploadQuerySchema
    }).query;

  const { sandbox } = await getAuthorizedSandboxClient({
    customUid,
    authProxy,
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: WritePermissionVal
  });

  const maxFileBytes = getAgentSandboxDiskBytes();
  const contentLengthHeader = req.headers['content-length'];
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  const createFileTooLargeError = () => new ApiHttpError(413, 'File exceeds maximum allowed size');

  if (contentLength !== undefined && contentLength > maxFileBytes) {
    throw createFileTooLargeError();
  }

  const providerPath = sandbox.resolveRuntimePath(path, { allowAbsolutePath: true });
  await sandbox.runWithRecovery(async () => {
    await assertSandboxWorkspaceWritable(sandbox.opensandbox, { rethrowRecoverable: true });
    await prepareSandboxFileParentDirectories(sandbox.opensandbox, [providerPath]);
  });

  const boundedStream = createSizeLimitedStream({
    stream: req,
    maxBytes: maxFileBytes,
    createExceededError: createFileTooLargeError
  });
  const [writeResult] = await sandbox.opensandbox.writeFiles([
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
