import { MongoAppVersion } from './schema';
import type { ClientSession } from '../../../common/mongo';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

/** 按已鉴权应用及版本 ID 批量读取节点，凭据来源解析只获得必需的快照字段。 */
export const findAppVersionNodes = ({
  appId,
  versionIds,
  session
}: {
  appId: string;
  versionIds: string[];
  session?: ClientSession;
}): Promise<{ _id: string; nodes: StoreNodeItemType[] }[]> => {
  const query = MongoAppVersion.find({ appId, _id: { $in: versionIds } }).select({ nodes: 1 });
  if (session) query.session(session);
  return query.lean<{ _id: string; nodes: StoreNodeItemType[] }[]>();
};
