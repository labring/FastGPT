import { createHash } from 'node:crypto';
import type { mongo } from 'mongoose';
import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { teamPoint } from '@fastgpt/service/support/wallet/sub/utils';
import { getTrainingUsageItems } from '@fastgpt/service/support/wallet/usage/controller';
import {
  UsageCollectionName,
  UsageItemCollectionName
} from '@fastgpt/service/support/wallet/usage/constants';
import { getMigrationDb, getSnapshotMetadata } from './snapshot';
import { MigrationRecordError, type Scope } from './records';

type Balance = { _id: string; paid: boolean };
export type Round = Scope & { _id: string; runnable: boolean };

const balanceId = (teamId: Types.ObjectId) => `balance:${teamId}`;

/** 按首次迁移时的团队判定统一写入，重跑从快照元数据读取。 */
export const prepareBalance = async (teamId: Types.ObjectId, assertActive: () => Promise<void>) => {
  const balances = getSnapshotMetadata<Balance>();
  const _id = balanceId(teamId);
  if (await balances.findOne({ _id })) return;
  const paid = await getCurrentBalance(teamId);
  await assertActive();
  await balances.updateOne({ _id }, { $setOnInsert: { paid } }, { upsert: true });
};

export const getInitialBalance = async (teamId: Types.ObjectId) => {
  const balance = await getSnapshotMetadata<Balance>().findOne({ _id: balanceId(teamId) });
  if (typeof balance?.paid !== 'boolean')
    throw new Error('Migration team balance has not been recorded');
  return balance.paid;
};

export const getCurrentBalance = async (teamId: Types.ObjectId) => {
  await teamPoint.clearTeamPointsCache(String(teamId));
  try {
    await checkTeamAIPoints(String(teamId), { refreshBalance: true });
    return true;
  } catch (error) {
    if (error === TeamErrEnum.aiPointsNotEnough) return false;
    throw error;
  }
};

/** 轮次和用量跨越驱动重试和迁移断点，按稳定业务键识别。 */
export const getMigrationUsageId = (migrationId: string, collectionId: Types.ObjectId) =>
  deterministicId(`${migrationId}:${collectionId}`);

export const recordRound = async (
  { scope, runnable }: { scope: Scope; runnable: boolean },
  session: ClientSession
) => {
  await getSnapshotMetadata<Round>().updateOne(
    { _id: `round:${scope.collectionId}` },
    {
      $setOnInsert: { ...scope, ...(!runnable && { runnable: false }) },
      ...(runnable && { $set: { runnable: true } })
    },
    { session, upsert: true }
  );
};

export const streamRounds = () =>
  getSnapshotMetadata<Round>()
    .find({ _id: { $gte: 'round:', $lt: 'round;' } })
    .sort({ teamId: 1, _id: 1 })
    .allowDiskUse();

type Bill = {
  scope: Scope;
  usageId: Types.ObjectId;
  dataset: mongo.Document;
  collection: mongo.Document;
  time: Date;
};

/** 续跑账单和明细与首笔工作同事务创建，历史账单及用量从原记录读取。 */
export const createMigrationBill = async (bill: Bill, session: ClientSession) => {
  const db = getMigrationDb();
  const usage = db.collection(UsageCollectionName);
  if (await usage.findOne({ _id: bill.usageId }, { session })) {
    throw new MigrationRecordError('Migration usage ID is already in use');
  }
  const { scope, collection, usageId, time } = bill;
  if (!(collection.tmbId instanceof Types.ObjectId) || typeof collection.name !== 'string') {
    throw new MigrationRecordError('Document is missing its billing owner or name');
  }
  const items = getBillItems(bill);
  await usage.insertOne(
    {
      _id: usageId,
      teamId: scope.teamId,
      tmbId: collection.tmbId,
      source: UsageSourceEnum.training,
      appName: collection.name,
      trainingCollectionId: scope.collectionId,
      totalPoints: 0,
      time
    },
    { session }
  );
  await db.collection(UsageItemCollectionName).insertMany(items, { session });
};

export const validateMigrationBill = async (bill: Bill) => {
  const db = getMigrationDb();
  const { scope, usageId, collection } = bill;
  const account = await db.collection(UsageCollectionName).findOne({
    _id: usageId,
    trainingCollectionId: scope.collectionId,
    teamId: scope.teamId,
    tmbId: collection.tmbId,
    source: UsageSourceEnum.training,
    totalPoints: 0
  });
  if (!account) throw new MigrationRecordError('Migration training bill is missing or mismatched');

  const items = await db.collection(UsageItemCollectionName).find({ usageId }).toArray();
  const expected = getBillItems(bill);
  if (
    items.length !== expected.length ||
    expected.some(
      (item) =>
        !items.some(
          (actual) =>
            item._id.equals(actual._id) &&
            item.teamId.equals(actual.teamId) &&
            item.itemType === actual.itemType &&
            item.modelId === actual.modelId &&
            actual.amount === 0
        )
    )
  ) {
    throw new MigrationRecordError('Migration training bill items are missing or mismatched');
  }
};

const deterministicId = (input: string) =>
  new Types.ObjectId(createHash('sha256').update(input).digest().subarray(0, 12));

const getBillItems = ({ scope, usageId, dataset, time }: Bill) => {
  const model = (id: unknown, name: unknown) => {
    if (typeof id === 'string' && id.trim()) return id;
    if (id instanceof Types.ObjectId) return String(id);
    return typeof name === 'string' && name.trim() ? name : undefined;
  };
  const embedding = model(dataset.vectorModelId, dataset.vectorModel);
  const agent = model(dataset.agentModelId, dataset.agentModel);
  const vlm = model(dataset.vlmModelId, dataset.vlmModel);
  if (!embedding)
    throw new MigrationRecordError('Knowledge base is missing its embedding model reference');

  // 与业务建单使用相同的零用量明细，迁移单独提供可重放的 ID 与切换时间。
  return getTrainingUsageItems({
    teamId: String(scope.teamId),
    usageId: String(usageId),
    vectorModelId: embedding,
    agentModelId: agent,
    vllmModelId: vlm
  }).map((item) => ({
    ...item,
    _id: deterministicId(`${usageId}:${item.itemType}`),
    teamId: scope.teamId,
    usageId,
    time
  }));
};
