import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  getDatasetCollectionPermissionEnabled,
  lockDatasetCollectionPermissionState,
  setDatasetCollectionPermissionEnabled,
  assertDatasetCollectionPermissionEnabled
} from '@fastgpt/service/support/permission/collection/datasetSwitch';

const createDataset = async (enabled: boolean) => {
  const teamId = String(new Types.ObjectId());
  const dataset = await MongoDataset.create({
    teamId,
    tmbId: String(new Types.ObjectId()),
    name: 'permissions',
    type: DatasetTypeEnum.dataset,
    collectionPermissionEnabled: enabled
  });
  return { teamId, datasetId: String(dataset._id) };
};
const realTransaction = async <T>(
  run: Parameters<typeof import('@fastgpt/service/common/mongo/sessionRun').mongoSessionRun<T>>[0]
) => {
  const { mongoSessionRun } = await vi.importActual<
    typeof import('@fastgpt/service/common/mongo/sessionRun')
  >('@fastgpt/service/common/mongo/sessionRun');
  return mongoSessionRun(run);
};

describe('getDatasetCollectionPermissionEnabled', () => {
  it.each([false, true])('读取真实开关状态：%s', async (enabled) => {
    expect(await getDatasetCollectionPermissionEnabled(await createDataset(enabled))).toBe(enabled);
  });
  it('不存在的知识库按关闭态返回', async () => {
    expect(
      await getDatasetCollectionPermissionEnabled({
        teamId: String(new Types.ObjectId()),
        datasetId: String(new Types.ObjectId())
      })
    ).toBe(false);
  });
});

describe('lockDatasetCollectionPermissionState', () => {
  it.each([false, true])('锁定并返回当前状态：%s；内部版本递增且不改变开关', async (enabled) => {
    const props = await createDataset(enabled);
    for (let version = 1; version <= 2; version++) {
      expect(
        await realTransaction((session) =>
          lockDatasetCollectionPermissionState({ ...props, session })
        )
      ).toBe(enabled);
      expect(
        await MongoDataset.findById(props.datasetId)
          .select('collectionPermissionEnabled collectionPermissionVersion')
          .lean()
      ).toMatchObject({
        collectionPermissionEnabled: enabled,
        collectionPermissionVersion: version
      });
    }
  });
  it('历史记录缺少版本字段时首次锁定自动初始化，无需迁移', async () => {
    const props = await createDataset(false);
    await MongoDataset.collection.updateOne(
      { _id: new Types.ObjectId(props.datasetId) },
      { $unset: { collectionPermissionVersion: 1 } }
    );
    await realTransaction((session) => lockDatasetCollectionPermissionState({ ...props, session }));
    expect(
      await MongoDataset.collection.findOne({ _id: new Types.ObjectId(props.datasetId) })
    ).toMatchObject({ collectionPermissionVersion: 1 });
  });
  it('不存在或跨团队的知识库不能获取锁', async () => {
    const props = await createDataset(false);
    for (const candidate of [
      { ...props, teamId: String(new Types.ObjectId()) },
      { ...props, datasetId: String(new Types.ObjectId()) }
    ]) {
      await expect(
        realTransaction((session) =>
          lockDatasetCollectionPermissionState({ ...candidate, session })
        )
      ).rejects.toBe(DatasetErrEnum.unExist);
    }
  });
});

describe('setDatasetCollectionPermissionEnabled / assertDatasetCollectionPermissionEnabled', () => {
  it('启停只改变开关，断言不允许隐式开启', async () => {
    const props = await createDataset(false);
    await expect(assertDatasetCollectionPermissionEnabled(props)).rejects.toBe(
      DatasetErrEnum.collectionPermissionDisabled
    );
    await realTransaction((session) =>
      setDatasetCollectionPermissionEnabled({ datasetId: props.datasetId, enabled: true, session })
    );
    await expect(assertDatasetCollectionPermissionEnabled(props)).resolves.toBeUndefined();
    await realTransaction((session) =>
      setDatasetCollectionPermissionEnabled({ datasetId: props.datasetId, enabled: false, session })
    );
    expect(await getDatasetCollectionPermissionEnabled(props)).toBe(false);
  });
});
