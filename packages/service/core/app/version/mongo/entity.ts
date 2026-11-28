import { MongoAppVersion } from '../schema';
import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';

/** 按已鉴权应用及版本 ID 批量投影节点；驱动会话仅在 Mongo 持久化边界解包。 */
export const findAppVersionNodes = async ({
  appId,
  versionIds,
  tx
}: {
  appId: string;
  versionIds: string[];
  tx?: DbSession;
}): Promise<Pick<AppVersionSchemaType, '_id' | 'nodes'>[]> => {
  const session = unwrapMongoSession(tx, 'main');
  const versions = await MongoAppVersion.find(
    { appId, _id: { $in: versionIds } },
    { nodes: 1 },
    { session }
  ).lean<Pick<AppVersionSchemaType, '_id' | 'nodes'>[]>();
  return versions.map((version) => ({ _id: String(version._id), nodes: version.nodes }));
};
