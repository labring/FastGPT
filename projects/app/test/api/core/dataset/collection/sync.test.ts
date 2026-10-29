import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/dataset/collection/sync';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import * as webFetch from '@fastgpt/service/common/string/cheerio';
import * as datasetS3 from '@fastgpt/service/common/s3/sources/dataset';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getFakeUsers } from '@test/datas/users';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';

vi.unmock('@fastgpt/service/support/user/audit/util');
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const rawText = 'Original collection content';
const collectionName = 'Original collection';
const rawLink = 'https://example.com/collection';

/** 使用真实集合、ACL 和审计存储，仅在外部网页抓取边界替换返回值。 */
const fixture = async (type = DatasetCollectionTypeEnum.link) => {
  const { owner, members } = await getFakeUsers(1);
  const defaults = getModelTestDefaults();
  const dataset = await MongoDataset.create({
    name: 'Sync audit dataset',
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    agentModelId: defaults.llm!.modelId,
    vectorModelId: defaults.embedding!.modelId,
    collectionPermissionEnabled: true
  });
  const collection = await MongoDatasetCollection.create({
    name: collectionName,
    type,
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    datasetId: dataset._id,
    rawLink,
    hashRawText: hashStr(rawText),
    metadata: { webPageSelector: 'main' }
  });
  return { owner, member: members[0], dataset, collection };
};

/** 等待非阻塞审计写入完成，并验证每次同步尝试只保存一条操作快照。 */
const expectSyncAudit = async ({ owner, dataset }: Awaited<ReturnType<typeof fixture>>) => {
  await vi.waitFor(async () => {
    const logs = await MongoTeamAudit.find({ teamId: owner.teamId }).lean();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].tmbId)).toBe(owner.tmbId);
    expect(logs[0]).toMatchObject({
      event: DatasetAuditEventEnum.DATASET_COLLECTION_SYNC,
      metadata: { datasetName: dataset.name, collectionName }
    });
  });
};

describe('sync collection audit', () => {
  beforeEach(() => {
    vi.spyOn(webFetch, 'urlsFetch').mockResolvedValue([
      { url: rawLink, title: collectionName, content: rawText, selector: 'main' }
    ]);
  });

  afterEach(() => vi.restoreAllMocks());

  it('records one attempt when the content is unchanged', async () => {
    const context = await fixture();
    const response = await Call(handler, {
      auth: context.owner,
      body: { collectionId: String(context.collection._id) }
    });

    expect(response.code).toBe(200);
    expect(response.data).toBe(DatasetCollectionSyncResultEnum.sameRaw);
    expect(webFetch.urlsFetch).toHaveBeenCalledWith({ urlList: [rawLink], selector: 'main' });
    await expectSyncAudit(context);
  });

  it('keeps the original audit snapshot when changed content rebuilds the collection', async () => {
    const context = await fixture();
    vi.mocked(webFetch.urlsFetch).mockResolvedValue([
      { url: rawLink, title: 'Updated collection', content: 'Updated body', selector: 'main' }
    ]);
    // 补齐全局 S3 替身的批量清理接口；集合重建和审计仍使用真实 Mongo 事务及存储。
    const source = datasetS3.getS3DatasetSource();
    source.deleteDatasetFilesByKeys = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(datasetS3, 'getS3DatasetSource').mockReturnValue(source);

    const response = await Call(handler, {
      auth: context.owner,
      body: { collectionId: String(context.collection._id) }
    });

    expect(response.code).toBe(200);
    expect(response.data).toBe(DatasetCollectionSyncResultEnum.success);
    expect(await MongoDatasetCollection.findById(context.collection._id).lean()).toBeNull();
    const replacement = await MongoDatasetCollection.findOne({
      datasetId: context.dataset._id
    }).lean();
    expect(replacement).toMatchObject({
      name: 'Updated collection',
      hashRawText: hashStr('Updated body')
    });
    await expectSyncAudit(context);
  });

  it('records an attempt when a failed fetch returns empty content and preserves the error', async () => {
    const context = await fixture();
    // urlsFetch 在超时或 HTTP 404 时返回空正文，真实读取服务随后抛出业务错误。
    vi.mocked(webFetch.urlsFetch).mockResolvedValue([
      { url: rawLink, title: '', content: '', selector: '' }
    ]);
    const response = await Call(handler, {
      auth: context.owner,
      body: { collectionId: String(context.collection._id) }
    });

    expect(response.code).not.toBe(200);
    expect(response.error).toBe('Can not fetch content from link');
    expect(await MongoDatasetCollection.findById(context.collection._id).lean()).toMatchObject({
      name: collectionName,
      hashRawText: hashStr(rawText)
    });
    await expectSyncAudit(context);
  });

  it('records an attempt when the fetch rejects and propagates the original exception', async () => {
    const context = await fixture();
    const error = new Error('Fetch transport failed');
    vi.mocked(webFetch.urlsFetch).mockRejectedValue(error);
    const response = await Call(handler, {
      auth: context.owner,
      body: { collectionId: String(context.collection._id) }
    });

    expect(response.code).not.toBe(200);
    expect(response.error).toBe(error);
    await expectSyncAudit(context);
  });

  it('does not fetch or audit when the member only has read permission', async () => {
    const context = await fixture();
    await MongoResourcePermission.create([
      {
        teamId: context.owner.teamId,
        tmbId: context.member.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: context.dataset._id,
        permission: ReadRoleVal
      },
      {
        teamId: context.owner.teamId,
        tmbId: context.member.tmbId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: context.collection._id,
        permission: ReadRoleVal
      }
    ]);
    const response = await Call(handler, {
      auth: context.member,
      body: { collectionId: String(context.collection._id) }
    });

    expect(response.error).toBe(DatasetErrEnum.unAuthDatasetCollection);
    expect(webFetch.urlsFetch).not.toHaveBeenCalled();
    expect(await MongoTeamAudit.countDocuments({ teamId: context.owner.teamId })).toBe(0);
  });

  it('does not audit unsupported collection types', async () => {
    const context = await fixture(DatasetCollectionTypeEnum.virtual);
    const response = await Call(handler, {
      auth: context.owner,
      body: { collectionId: String(context.collection._id) }
    });

    expect(response.error).toBe(DatasetErrEnum.notSupportSync);
    expect(webFetch.urlsFetch).not.toHaveBeenCalled();
    expect(await MongoTeamAudit.countDocuments({ teamId: context.owner.teamId })).toBe(0);
  });

  it('rejects invalid input before fetching or auditing', async () => {
    const context = await fixture();
    const response = await Call(handler, {
      auth: context.owner,
      body: { collectionId: 'invalid-id' }
    });

    expect(response.code).not.toBe(200);
    expect(webFetch.urlsFetch).not.toHaveBeenCalled();
    expect(await MongoTeamAudit.countDocuments({ teamId: context.owner.teamId })).toBe(0);
  });
});
