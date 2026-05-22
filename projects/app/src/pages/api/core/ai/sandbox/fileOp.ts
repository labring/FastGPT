import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  SandboxFileOpBodySchema,
  type SandboxFileOpResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const opMap: Record<
  string,
  (sandbox: SandboxClient, path: string, destPath?: string) => Promise<string>
> = {
  mkdir: async (_, path) => `mkdir -p "${path}"`,
  delete: async (_, path) => `rm -rf "${path}"`,
  move: async (sandbox, path, destPath) => {
    if (!destPath) throw new Error('destPath is required for move');
    const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
    if (parentDir && parentDir !== '.') {
      await sandbox.exec(`mkdir -p "${parentDir}"`);
    }
    return `mv "${path}" "${destPath}"`;
  },
  copy: async (sandbox, path, destPath) => {
    if (!destPath) throw new Error('destPath is required for copy');
    const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
    if (parentDir && parentDir !== '.') {
      await sandbox.exec(`mkdir -p "${parentDir}"`);
    }
    return `cp -r "${path}" "${destPath}"`;
  }
};

async function handler(req: ApiRequestProps): Promise<SandboxFileOpResponse> {
  const { appId, chatId, type, path, destPath, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxFileOpBodySchema
  }).body;

  let uid: string;
  if (chatId === 'edit-debug') {
    const authResult = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId: appId,
      per: WritePermissionVal
    });
    uid = authResult.tmbId;
  } else {
    const authResult = await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId,
      ...outLinkAuthData
    });
    uid = authResult.uid;
  }

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId });
  await sandbox.ensureAvailable();

  // 严格的路径安全校验，防止 Shell 注入。仅允许常规字符、中文字符及空格，拒绝换行/回车符
  const safePathPattern = /^[a-zA-Z0-9_\-\.\/ \u4e00-\u9fa5]+$/;
  if (!safePathPattern.test(path) || (destPath && !safePathPattern.test(destPath))) {
    throw new Error('Invalid path characters');
  }
  if (path.includes('..') || (destPath && destPath.includes('..'))) {
    throw new Error('Path traversal detected');
  }

  const opHandler = opMap[type];
  if (!opHandler) {
    throw new Error('Unsupported operation type');
  }

  const cmd = await opHandler(sandbox, path, destPath);

  const result = await sandbox.exec(cmd);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Execute command failed: ${cmd}`);
  }

  return { success: true };
}

export default NextAPI(handler);
