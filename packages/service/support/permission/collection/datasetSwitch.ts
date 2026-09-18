import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDataset } from '../../../core/dataset/schema';
import type { ClientSession } from '../../../common/mongo';

/**
 * Dataset 级 collection 权限开关（`collectionPermissionEnabled`）读写。
 *
 * 语义：开关是 collection 级自定义权限的**唯一入口**。
 *  - `false`（默认，含全部存量数据）：读路径短路到 dataset 有效权限，不查询也不依赖任何
 *    collection ACL 行，因此存量数据无需迁移；
 *  - `true`：逐 collection 解析物化快照，由「启用时物化」（enable.ts）保证该 dataset 下每个
 *    collection 都有完整快照。
 *
 * 只有启用/关闭接口（enable.ts）可以改变该字段；其余写路径统一通过
 * `assertDatasetCollectionPermissionEnabled` 做前置断言，禁止任何形式的「隐式开启」——
 * 隐式开启会让关闭态数据被按逐 collection 解析，而关闭态并不保证存在快照行。
 */

/** 读取开关；字段缺失（旧数据）视为关闭。 */
export const getDatasetCollectionPermissionEnabled = async ({
  teamId,
  datasetId,
  session
}: {
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}): Promise<boolean> => {
  const dataset = await MongoDataset.findOne(
    { _id: datasetId, teamId },
    'collectionPermissionEnabled',
    {
      ...(session ? { session } : {})
    }
  ).lean();

  return dataset?.collectionPermissionEnabled === true;
};

/** 置位开关。仅允许启用/关闭接口调用，且必须在同一事务会话内完成。 */
export const setDatasetCollectionPermissionEnabled = ({
  datasetId,
  enabled,
  session
}: {
  datasetId: string;
  enabled: boolean;
  session: ClientSession;
}) =>
  MongoDataset.updateOne(
    { _id: datasetId },
    { $set: { collectionPermissionEnabled: enabled } },
    { session }
  );

/**
 * 断言 dataset 已启用 collection 权限。
 *
 * 未启用时以 `DatasetErrEnum.collectionPermissionDisabled` 拒绝，由调用方转换成前端可识别的
 * 「需要开启文件级权限」提示。注意本函数**不提供开启能力**：没有 dataset `manage` 的用户只能
 * 看到提示，开启入口只在启用接口中。
 */
export const assertDatasetCollectionPermissionEnabled = async ({
  teamId,
  datasetId,
  session
}: {
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}): Promise<void> => {
  const enabled = await getDatasetCollectionPermissionEnabled({ teamId, datasetId, session });

  if (!enabled) {
    return Promise.reject(DatasetErrEnum.collectionPermissionDisabled);
  }
};
