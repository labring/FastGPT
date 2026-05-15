import { isValidObjectId } from 'mongoose';
import type { SandboxStatusType } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { SkillSandboxEndpointType } from '@fastgpt/global/core/agentSkills/type';
import { MongoSandboxInstance } from './schema';
import type { SandboxInstanceSchemaType } from './type';

export type SandboxResourceDoc = Pick<SandboxInstanceSchemaType, 'provider' | 'sandboxId'> & {
  _id: unknown;
};

export const buildSandboxInstanceLookup = (sandboxId: string) => ({
  $or: [{ sandboxId }, ...(isValidObjectId(sandboxId) ? [{ _id: sandboxId }] : [])]
});

export async function findSandboxInstanceByAppChatType(params: {
  appId: string;
  chatId: string;
  sandboxType: SandboxTypeEnum;
  status?: SandboxStatusType;
}) {
  const { appId, chatId, sandboxType, status } = params;

  return MongoSandboxInstance.findOne({
    appId,
    chatId,
    ...(status ? { status } : {}),
    'metadata.sandboxType': sandboxType
  });
}

export async function findSandboxResourcesByAppChatType(params: {
  appId: string;
  chatId: string;
  sandboxType: SandboxTypeEnum;
}) {
  const { appId, chatId, sandboxType } = params;

  return MongoSandboxInstance.find({
    appId,
    chatId,
    'metadata.sandboxType': sandboxType
  }).lean<SandboxResourceDoc[]>();
}

export async function countRunningSandboxInstancesByType(sandboxType: SandboxTypeEnum) {
  return MongoSandboxInstance.countDocuments({
    status: SandboxStatusEnum.running,
    'metadata.sandboxType': sandboxType
  });
}

export async function updateSandboxInstanceEndpoint(params: {
  instanceId: unknown;
  endpoint: SkillSandboxEndpointType;
}) {
  const { instanceId, endpoint } = params;

  return MongoSandboxInstance.updateOne(
    { _id: instanceId },
    {
      $set: {
        'metadata.endpoint': endpoint
      }
    }
  );
}

export async function deleteSandboxInstanceRecord(instanceId: unknown) {
  return MongoSandboxInstance.deleteOne({ _id: instanceId });
}

export async function updateSandboxInstanceRecordBySandboxId(params: {
  sandboxId: string;
  appId?: string;
  userId?: string;
  chatId?: string;
  metadata?: Record<string, unknown>;
}) {
  const { sandboxId, appId, userId, chatId, metadata } = params;

  return MongoSandboxInstance.findOneAndUpdate(
    { sandboxId },
    {
      $set: {
        ...(appId !== undefined ? { appId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        ...(chatId !== undefined ? { chatId } : {}),
        ...(metadata !== undefined ? { metadata } : {})
      }
    },
    { new: true }
  );
}

export async function findSandboxInstanceBySandboxIdAndTeam(params: {
  sandboxId: string;
  teamId: string;
}) {
  const { sandboxId, teamId } = params;

  return MongoSandboxInstance.findOne({
    ...buildSandboxInstanceLookup(sandboxId),
    'metadata.teamId': teamId
  });
}

export async function findSandboxResourceBySandboxIdAndTeam(params: {
  sandboxId: string;
  teamId: string;
}) {
  const { sandboxId, teamId } = params;

  return MongoSandboxInstance.findOne({
    ...buildSandboxInstanceLookup(sandboxId),
    'metadata.teamId': teamId
  }).lean<SandboxResourceDoc | null>();
}

export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    $or: [{ appId: { $in: skillIds } }, { 'metadata.skillId': { $in: skillIds } }]
  }).lean<SandboxResourceDoc[]>();
}
