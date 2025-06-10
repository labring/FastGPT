import { MongoSecret } from './schema';
import { HeaderAuthTypeEnum, type SecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';

export const upsertSecrets = async ({
  secrets,
  type,
  appId
}: {
  secrets: StoreSecretValueType[];
  type: SecretTypeEnum;
  appId: string;
}) => {
  // get all valid secret items
  const secretItems = (secrets || []).flatMap((item) =>
    Object.values(item)
      .filter((value) => !!value.secretId && !!value.value)
      .map((value) => ({
        sourceId: value.secretId,
        type,
        value: value.value
      }))
  );

  // find all current secrets
  const currentSecrets = await MongoSecret.find({
    sourceId: { $regex: `^${appId}` },
    type
  }).lean();

  // calculate the sourceIds to keep, delete and add
  const currentSourceIds = currentSecrets.map((secret) => secret.sourceId);
  const newSourceIds = secretItems.map((item) => item.sourceId);

  // the sourceIds to delete
  const deleteSourceIds = currentSourceIds.filter((id) => !newSourceIds.includes(id));

  // delete the secrets that are not needed
  if (deleteSourceIds.length > 0) {
    await MongoSecret.deleteMany({
      sourceId: { $in: deleteSourceIds },
      type
    });
  }

  // batch update or create new secrets
  if (secretItems.length > 0) {
    const bulkOps = secretItems.map((secret) => ({
      updateOne: {
        filter: { sourceId: secret.sourceId, type },
        update: { $set: secret },
        upsert: true
      }
    }));

    await MongoSecret.bulkWrite(bulkOps);
  }
};

export const getHeaderAuthValue = async (headerAuth: StoreSecretValueType) => {
  if (!headerAuth || Object.keys(headerAuth).length === 0) return [];

  // extract all valid secretIds
  const secretIds = Object.values(headerAuth)
    .map((value) => value.secretId)
    .filter(Boolean);

  // get all related secrets
  const secrets =
    secretIds.length > 0 ? await MongoSecret.find({ sourceId: { $in: secretIds } }).lean() : [];
  const secretsMap = new Map(secrets.map((secret) => [secret.sourceId, secret.value]));

  // build and return headerAuths
  return Object.entries(headerAuth).map(([key, { secretId, value: defaultValue }]) => {
    const secretValue = secretId ? secretsMap.get(secretId) : undefined;
    const actualValue = secretValue || defaultValue || '';

    const isAuthHeader = [HeaderAuthTypeEnum.Bearer, HeaderAuthTypeEnum.Basic].includes(
      key as HeaderAuthTypeEnum
    );
    const formatKey = isAuthHeader ? 'Authorization' : key;
    const formatValue = (() => {
      if (key === HeaderAuthTypeEnum.Bearer) {
        return `Bearer ${actualValue}`;
      }
      if (key === HeaderAuthTypeEnum.Basic) {
        return `Basic ${actualValue}`;
      }
      return actualValue;
    })();

    return { key: formatKey, value: formatValue, type: 'string' };
  });
};
