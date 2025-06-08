import { type TeamSecretTypeEnum } from '@fastgpt/global/common/teamSecret/constants';
import { MongoTeamSecret } from './schema';
import type { HeaderAuthValueType } from '@fastgpt/global/common/teamSecret/type';

export async function addTeamSecret({
  teamSecret,
  type,
  appId
}: {
  teamSecret: { [key: string]: HeaderAuthValueType }[];
  type: TeamSecretTypeEnum;
  appId: string;
}) {
  const newSecretIds = teamSecret.flatMap((item) =>
    Object.values(item)
      .filter((value) => value && value.secretId)
      .map((value) => value.secretId)
  );

  await deleteTeamSecretsByCondition({
    appId,
    type,
    excludeSecretIds: newSecretIds
  });

  const secretItems = teamSecret.flatMap((item) => {
    return Object.entries(item)
      .map(([key, value]) => ({
        sourceId: value.secretId,
        type,
        value: value.value
      }))
      .filter((item) => !!item.value && !!item.sourceId);
  });

  if (secretItems.length === 0) return;

  await handleCreateAndUpdate(secretItems, type);
}

async function handleCreateAndUpdate(
  secretItems: Array<{ sourceId: string; type: string; value: string }>,
  type: string
) {
  const existingSecrets = await MongoTeamSecret.find({
    sourceId: { $in: secretItems.map((item) => item.sourceId) },
    type
  });

  const existingSourceIds = existingSecrets.map((item) => item.sourceId);
  const secretsToCreate = secretItems.filter((item) => !existingSourceIds.includes(item.sourceId));
  const secretsToUpdate = secretItems.filter((item) => existingSourceIds.includes(item.sourceId));

  const promises = [];

  if (secretsToCreate.length > 0) {
    promises.push(MongoTeamSecret.insertMany(secretsToCreate));
  }

  if (secretsToUpdate.length > 0) {
    const bulkOps = secretsToUpdate.map((secret) => ({
      updateOne: {
        filter: { sourceId: secret.sourceId, type },
        update: { $set: { value: secret.value } }
      }
    }));
    promises.push(MongoTeamSecret.bulkWrite(bulkOps));
  }

  await Promise.all(promises);
}

export async function getTeamSecretsByIds(secretIds: string[]) {
  if (!secretIds || secretIds.length === 0) {
    return [];
  }

  return await MongoTeamSecret.find({ sourceId: { $in: secretIds } }).lean();
}

export async function deleteTeamSecretsByCondition({
  appId,
  type,
  excludeSecretIds = []
}: {
  appId: string;
  type: TeamSecretTypeEnum;
  excludeSecretIds?: string[];
}) {
  const conditions: Array<Record<string, any>> = [{ sourceId: { $regex: `^${appId}` } }];

  if (excludeSecretIds.length > 0) {
    conditions.push({ sourceId: { $nin: excludeSecretIds } });
  }

  return await MongoTeamSecret.deleteMany({
    $and: conditions,
    type
  });
}
