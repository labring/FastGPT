import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/types';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import { multer } from '@fastgpt/service/common/file/multer';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SandboxUploadBodySchema,
  SandboxUploadResponseSchema,
  type SandboxUploadResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getAgentSandboxMaxFileBytes } from '@fastgpt/service/core/ai/sandbox/interface/config';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { resolveSandboxWorkspacePath } from '@fastgpt/service/core/ai/sandbox/interface/file';
import { Readable } from 'node:stream';

async function handler(req: ApiRequestProps): Promise<SandboxUploadResponse> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return Promise.reject('Content-Type must be multipart/form-data');
  }

  const filepaths: string[] = [];

  try {
    const maxFileBytes = getAgentSandboxMaxFileBytes();
    const form = await multer.resolveFormData({
      request: req,
      maxFileSize: Math.ceil(maxFileBytes / 1024 / 1024)
    });
    if (form.fileMetadata.path) {
      filepaths.push(form.fileMetadata.path);
    }

    const { sourceType, sourceId, chatId, path, outLinkAuthData } = parseApiInput({
      req: { body: form.data },
      bodySchema: SandboxUploadBodySchema
    }).body;

    if (form.fileMetadata.size > maxFileBytes) {
      return Promise.reject(
        `File is too large (${form.fileMetadata.size} bytes > ${maxFileBytes} bytes)`
      );
    }

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
      per: WritePermissionVal
    });

    const sandbox = await getSandboxClient(
      buildSandboxClientQueryFromChatSource({
        sourceType: resolvedSourceType,
        sourceId: resolvedSourceId,
        userId: uid,
        chatId
      }),
      {
        failedArchivePolicy: 'clearAndContinue'
      }
    );

    const providerPath = resolveSandboxWorkspacePath(path);
    const [writeResult] = await sandbox.provider.writeFiles([
      {
        path: providerPath,
        data: Readable.toWeb(form.getReadStream()) as ReadableStream<Uint8Array>
      }
    ]);

    if (!writeResult || writeResult.error) {
      return Promise.reject(
        `Failed to upload file: ${writeResult?.error?.message || 'unknown error'}`
      );
    }

    return SandboxUploadResponseSchema.parse({
      path,
      bytesWritten: writeResult.bytesWritten || form.fileMetadata.size
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
