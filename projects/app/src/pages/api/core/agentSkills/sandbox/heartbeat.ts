import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  HeartbeatSandboxBodySchema,
  HeartbeatSandboxResponseSchema,
  type HeartbeatSandboxBody,
  type HeartbeatSandboxResponse
} from '@fastgpt/global/core/agentSkills/api';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(
  req: ApiRequestProps<HeartbeatSandboxBody>
): Promise<HeartbeatSandboxResponse> {
  const { sandboxId } = HeartbeatSandboxBodySchema.parse(req.body);

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  const result = await MongoSandboxInstance.updateOne(
    {
      sandboxId,
      'metadata.teamId': teamId
    },
    {
      $set: {
        lastActiveAt: new Date()
      }
    }
  );

  if (result.matchedCount === 0) {
    return Promise.reject('Sandbox not found or access denied');
  }

  return HeartbeatSandboxResponseSchema.parse({ success: true });
}

export default NextAPI(handler);
