import { isValidObjectId } from 'mongoose';
import type { SandboxStatusType } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { SkillSandboxEndpointType } from '@fastgpt/global/core/agentSkills/type';
import { MongoSandboxInstance } from './schema';
import type { SandboxInstanceSchemaType, SandboxProviderType } from './type';

export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  'provider' | 'sandboxId' | 'type'
> & {
  _id: unknown;
};

export const buildSandboxInstanceLookup = (sandboxId: string) => ({
  $or: [{ sandboxId }, ...(isValidObjectId(sandboxId) ? [{ _id: sandboxId }] : [])]
});

export async function findSandboxInstanceByAppChatType(params: {
  provider?: SandboxProviderType;
  appId: string;
  chatId: string;
  type: SandboxTypeEnum;
  status?: SandboxStatusType;
}) {
  const { provider, appId, chatId, type, status } = params;

  return MongoSandboxInstance.findOne({
    ...(provider ? { provider } : {}),
    appId,
    chatId,
    ...(status ? { status } : {}),
    type
  });
}

export async function findSandboxResourcesByAppChatType(params: {
  provider?: SandboxProviderType;
  appId: string;
  chatId: string;
  type: SandboxTypeEnum;
}) {
  const { provider, appId, chatId, type } = params;

  return MongoSandboxInstance.find({
    ...(provider ? { provider } : {}),
    appId,
    chatId,
    type
  }).lean<SandboxResourceDoc[]>();
}

export async function findSandboxResourcesByAppChatTypeExcludeProvider(params: {
  provider: SandboxProviderType;
  appId: string;
  chatId: string;
  type: SandboxTypeEnum;
}) {
  const { provider, appId, chatId, type } = params;

  return MongoSandboxInstance.find({
    provider: { $ne: provider },
    appId,
    chatId,
    type
  }).lean<SandboxResourceDoc[]>();
}

export async function countRunningSandboxInstancesByType(
  type: SandboxTypeEnum,
  provider?: SandboxProviderType
) {
  return MongoSandboxInstance.countDocuments({
    ...(provider ? { provider } : {}),
    status: SandboxStatusEnum.running,
    type
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
        status: SandboxStatusEnum.running,
        lastActiveAt: new Date(),
        'metadata.endpoint': endpoint
      }
    }
  );
}

export async function deleteSandboxInstanceRecord(instanceId: unknown) {
  return MongoSandboxInstance.deleteOne({ _id: instanceId });
}

export async function updateSandboxInstanceRecordBySandboxId(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  appId?: string;
  userId?: string;
  chatId?: string;
  type?: SandboxTypeEnum;
  metadata?: Record<string, unknown>;
}) {
  const { provider, sandboxId, appId, userId, chatId, type, metadata } = params;

  return MongoSandboxInstance.findOneAndUpdate(
    {
      sandboxId,
      ...(provider ? { provider } : {})
    },
    {
      $set: {
        ...(appId !== undefined ? { appId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        ...(chatId !== undefined ? { chatId } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(metadata !== undefined ? { metadata } : {})
      }
    },
    { new: true }
  );
}

export async function findSandboxInstanceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  const { provider, sandboxId, teamId } = params;

  return MongoSandboxInstance.findOne({
    ...buildSandboxInstanceLookup(sandboxId),
    ...(provider ? { provider } : {}),
    'metadata.teamId': teamId
  });
}

export async function findSandboxResourceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  const { provider, sandboxId, teamId } = params;

  return MongoSandboxInstance.findOne({
    ...buildSandboxInstanceLookup(sandboxId),
    ...(provider ? { provider } : {}),
    'metadata.teamId': teamId
  }).lean<SandboxResourceDoc | null>();
}

export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    $or: [{ appId: { $in: skillIds } }, { 'metadata.skillId': { $in: skillIds } }]
  }).lean<SandboxResourceDoc[]>();
}
