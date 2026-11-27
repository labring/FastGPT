import { rm, stat } from 'node:fs/promises';
import handler from '@/pages/api/core/dataset/exportAll';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import * as multipart from '@fastgpt/service/common/file/multer';
import * as fileParseResource from '@fastgpt/service/worker/fileParseResource';
import { readRawContentFromSource } from '@fastgpt/service/worker/function';
import { WorkerNameEnum, WorkerPool } from '@fastgpt/service/worker/utils';
import {
  readXlsxRawText,
  XLSX_PARSE_LIMITS
} from '@fastgpt/service/worker/readFile/extension/xlsx';
import { getFakeUsers, getUser } from '@test/datas/users';
import { StreamCall } from '@test/utils/request';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDisableApiDatasetSuperAdmin } from '@test/utils/serviceEnv';
import { readXlsxRows } from '@test/utils/xlsx';

vi.mock('node:fs/promises', async (loadFs) => {
  const fs = await loadFs<typeof import('node:fs/promises')>();
  return { ...fs, rm: vi.fn(fs.rm) };
});

vi.mock('@fastgpt/service/worker/function', async (loadWorker) => {
  const worker = await loadWorker<typeof import('@fastgpt/service/worker/function')>();
  return {
    ...worker,
    readRawContentFromSource: vi.fn<typeof worker.readRawContentFromSource>(
      async ({ source, sparseXlsxRows }) => {
        const { buffer } = await source.materialize({ signal: new AbortController().signal });
        return readXlsxRawText(
          { extension: 'xlsx', buffer, encoding: 'utf-8' },
          { sparseRows: sparseXlsxRows }
        );
      }
    )
  };
});

type TestUser = { teamId: string; tmbId: string };
const defaultWorkerLimits = { ...XLSX_PARSE_LIMITS };

const expectRestoreLimitError = (
  response: Awaited<ReturnType<typeof StreamCall>>,
  message: RegExp
) => {
  expect(response.error).toMatchObject({
    name: 'UserConfigError',
    displayMessage: 'dataset:backup_export_limit_exceeded',
    message: expect.stringMatching(message)
  });
  expect(response.headers['Content-Disposition']).toBeUndefined();
  expect(response.buffer).toHaveLength(0);
};

const createDataset = async ({
  name,
  owner,
  type = DatasetTypeEnum.dataset,
  parentId,
  collectionPermissionEnabled,
  apiDatasetServer
}: {
  name: string;
  owner: TestUser;
  type?: DatasetTypeEnum;
  parentId?: string;
  collectionPermissionEnabled?: boolean;
  apiDatasetServer?: Record<string, unknown>;
}) =>
  MongoDataset.create({
    name,
    type,
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    parentId,
    collectionPermissionEnabled,
    apiDatasetServer,
    vectorModel: 'test',
    agentModel: 'test'
  });

const createFileCollection = async ({
  name,
  owner,
  datasetId
}: {
  name: string;
  owner: TestUser;
  datasetId: string;
}) => {
  const collection = await MongoDatasetCollection.create({
    name,
    type: DatasetCollectionTypeEnum.file,
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    datasetId
  });
  // 启用态下每个 collection 都有 owner 行，保持与线上物化结果一致。
  await MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.collection,
    teamId: owner.teamId,
    resourceId: String(collection._id),
    tmbId: owner.tmbId,
    permission: OwnerRoleVal
  });
  await MongoDatasetData.create({
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    datasetId,
    collectionId: collection._id,
    q: `${name}-q`,
    a: `${name}-a`
  });
  return collection;
};

const grantDataset = async ({
  datasetId,
  user,
  permission
}: {
  datasetId: string;
  user: TestUser;
  permission: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.dataset,
    teamId: user.teamId,
    resourceId: datasetId,
    tmbId: user.tmbId,
    permission
  });

const grantCollection = async ({
  collectionId,
  user,
  permission = ReadRoleVal
}: {
  collectionId: string;
  user: TestUser;
  permission?: number;
}) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.collection,
    teamId: user.teamId,
    resourceId: collectionId,
    tmbId: user.tmbId,
    permission
  });

afterEach(() => {
  setDisableApiDatasetSuperAdmin(false);
  Object.assign(XLSX_PARSE_LIMITS, defaultWorkerLimits);
  vi.mocked(rm).mockReset();
  vi.restoreAllMocks();
});

it('cancels queued backup validation and removes the temporary backup on disconnect', async () => {
  const { owner } = await getFakeUsers(1);
  const dataset = await createDataset({ name: 'cancelled-backup', owner });
  const removeBackup = vi.mocked(rm);
  const pool = new WorkerPool<{ resourceBytes: number }, never>({
    name: WorkerNameEnum.readFile,
    maxReservedThreads: 1,
    resourcePolicy: {
      getTaskResourceBytes: ({ resourceBytes }) => resourceBytes,
      getResourceSnapshot: () => ({ availableResourceBytes: 0, maximumTaskResourceBytes: 100 }),
      queueTimeoutMs: 1000
    }
  });
  const response = await StreamCall(
    (req, res) => {
      vi.mocked(readRawContentFromSource).mockImplementationOnce(({ signal }) => {
        const parsing = pool.run({ resourceBytes: 1 }, undefined, { signal });
        expect(pool.waitQueue).toHaveLength(1);
        res.destroy();
        return parsing;
      });
      return handler(req, res);
    },
    { auth: owner, query: { datasetId: String(dataset._id) } }
  );

  expect(response.error).toMatchObject({ message: 'XLSX download connection closed' });
  expect(response.headers['Content-Disposition']).toBeUndefined();
  expect(pool.waitQueue).toHaveLength(0);
  expect(removeBackup).toHaveBeenCalledOnce();
  await expect(stat(removeBackup.mock.calls[0][0])).rejects.toMatchObject({ code: 'ENOENT' });
});

it('preserves the validation error when temporary backup removal fails', async () => {
  const { owner } = await getFakeUsers(1);
  const dataset = await createDataset({ name: 'failed-backup', owner });
  const error = new Error('Backup validation failed');
  const removeBackup = vi.mocked(rm).mockRejectedValueOnce(new Error('Backup removal failed'));
  vi.mocked(readRawContentFromSource).mockRejectedValueOnce(error);

  try {
    const response = await StreamCall(handler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });
    expect(removeBackup).toHaveBeenCalledOnce();
    expect(response.error).toBe(error);
  } finally {
    const directory = removeBackup.mock.calls[0]?.[0];
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it('round-trips sparse backups at the restore limits and rejects them before download beyond those limits', async () => {
  const { owner } = await getFakeUsers(1);
  const dataset = await createDataset({ name: 'sparse-backup', owner });
  const datasetId = String(dataset._id);
  const wide = await createFileCollection({ name: 'wide', owner, datasetId });
  const sparse = await createFileCollection({ name: 'sparse', owner, datasetId });
  await MongoDatasetData.updateOne(
    { collectionId: wide._id },
    {
      $set: {
        indexes: [{ type: DatasetDataIndexTypeEnum.custom, dataId: 'custom', text: 'Index' }]
      }
    }
  );
  await MongoDatasetData.updateOne(
    { collectionId: sparse._id },
    { $set: { metadata: { count: 1 } } }
  );

  const limits = { maxRows: 3, maxColumns: 4, maxCells: 6 };
  Object.assign(XLSX_PARSE_LIMITS, limits);
  const download = () => StreamCall(handler, { auth: owner, query: { datasetId } });
  const res = await download();

  expect(res.code).toBe(200);
  const restore = () =>
    readXlsxRawText(
      { extension: 'xlsx', buffer: res.buffer, encoding: 'utf-8' },
      { sparseRows: true }
    );
  const { xlsxRows = [] } = await restore();
  expect(xlsxRows).toHaveLength(3);
  expect([...xlsxRows[0].values()]).toEqual(['q', 'a', 'index', 'metadata']);
  expect(xlsxRows[1].get(2)).toBe('Index');
  expect([...xlsxRows[2]]).toEqual([
    [0, 'sparse-q'],
    [1, 'sparse-a'],
    [3, '{"count":1}']
  ]);

  for (const [limit, error] of [
    ['maxRows', /maximum row limit of 2/],
    ['maxColumns', /maximum column limit of 3/],
    ['maxCells', /maximum data cell limit of 5/]
  ] as const) {
    Object.assign(XLSX_PARSE_LIMITS, limits, { [limit]: limits[limit] - 1 });
    await expect(restore()).rejects.toThrow(error);
    expectRestoreLimitError(await download(), error);
  }

  Object.assign(XLSX_PARSE_LIMITS, limits);
  const budget = vi.spyOn(fileParseResource, 'estimateFileParseMemoryBytes').mockReturnValue(1);
  const archiveError = /maximum uncompressed data limit of 1 bytes/;
  await expect(restore()).rejects.toThrow(archiveError);
  expectRestoreLimitError(await download(), archiveError);
  expect(budget).toHaveBeenLastCalledWith({ extension: 'xlsx', fileSizeBytes: res.buffer.length });
  budget.mockRestore();
  vi.spyOn(multipart, 'getMultipartFileSizeLimitBytes').mockReturnValue(res.buffer.length);
  expectRestoreLimitError(await download(), /reaches the upload limit/);
});

describe('export dataset respects collection permission', () => {
  it('exports only collections readable by the collaborator', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({
      name: 'enabled-dataset',
      owner,
      collectionPermissionEnabled: true
    });
    const allowed = await createFileCollection({
      name: 'allowed',
      owner,
      datasetId: String(dataset._id)
    });
    const restricted = await createFileCollection({
      name: 'restricted',
      owner,
      datasetId: String(dataset._id)
    });
    await grantDataset({ datasetId: String(dataset._id), user: member, permission: WriteRoleVal });
    await grantCollection({ collectionId: String(allowed._id), user: member });

    const res = await StreamCall(handler, {
      auth: member,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toEqual([
      ['q', 'a'],
      ['allowed-q', 'allowed-a']
    ]);
    void restricted;
  });

  it('exports headers only when the collaborator can read no collection', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({
      name: 'enabled-dataset-no-readable',
      owner,
      collectionPermissionEnabled: true
    });
    await createFileCollection({ name: 'hidden', owner, datasetId: String(dataset._id) });
    await grantDataset({ datasetId: String(dataset._id), user: member, permission: WriteRoleVal });

    const res = await StreamCall(handler, {
      auth: member,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toEqual([['q', 'a']]);
  });

  it('keeps exporting everything when collection permission is disabled', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({ name: 'closed-dataset', owner });
    await createFileCollection({ name: 'open-file', owner, datasetId: String(dataset._id) });
    await grantDataset({ datasetId: String(dataset._id), user: member, permission: WriteRoleVal });

    const res = await StreamCall(handler, {
      auth: member,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toContainEqual(['open-file-q', 'open-file-a']);
  });

  it('does not filter for the team owner', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const dataset = await createDataset({
      name: 'owner-dataset',
      owner,
      collectionPermissionEnabled: true
    });
    await createFileCollection({ name: 'owner-file', owner, datasetId: String(dataset._id) });

    const res = await StreamCall(handler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toContainEqual(['owner-file-q', 'owner-file-a']);
  });

  it('filters collections for the team owner when disableSuperAdmin is on', async () => {
    setDisableApiDatasetSuperAdmin(true);
    const users = await getFakeUsers(1);
    const teamOwner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({
      name: 'disable-super-admin-dataset',
      owner: member,
      collectionPermissionEnabled: true,
      apiDatasetServer: { apiServer: { baseUrl: 'https://example.com' } }
    });
    // 导出要求 dataset write，disableSuperAdmin 又关掉了团队 owner 旁路，必须显式授予。
    await grantDataset({
      datasetId: String(dataset._id),
      user: teamOwner,
      permission: WriteRoleVal
    });
    // 文件作者是 member：owner 行只属于 member，团队 owner 没有 collection ACL
    await createFileCollection({
      name: 'member-file',
      owner: member,
      datasetId: String(dataset._id)
    });

    const res = await StreamCall(handler, {
      auth: teamOwner,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toEqual([['q', 'a']]);
  });

  it('keeps the team-owner bypass for ordinary datasets when disableSuperAdmin is on', async () => {
    setDisableApiDatasetSuperAdmin(true);
    const users = await getFakeUsers(1);
    const teamOwner = users.owner;
    const member = users.members[0];
    const dataset = await createDataset({
      name: 'ordinary-dataset',
      owner: member,
      collectionPermissionEnabled: true
    });
    await createFileCollection({
      name: 'member-file',
      owner: member,
      datasetId: String(dataset._id)
    });

    const res = await StreamCall(handler, {
      auth: teamOwner,
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toContainEqual(['member-file-q', 'member-file-a']);
  });

  it('exports all collections for a cross-team root user', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const foreignRoot = await getUser('cross-team-root');
    const dataset = await createDataset({
      name: 'root-dataset',
      owner,
      collectionPermissionEnabled: true
    });
    await createFileCollection({ name: 'root-file', owner, datasetId: String(dataset._id) });

    // root 可以跨团队：导出范围必须按 dataset 归属查，且 root 不需要文件 ACL。
    const res = await StreamCall(handler, {
      auth: { ...foreignRoot, isRoot: true },
      query: { datasetId: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(readXlsxRows(res.buffer)).toContainEqual(['root-file-q', 'root-file-a']);
  });

  it('rejects exporting a folder', async () => {
    const users = await getFakeUsers(1);
    const owner = users.owner;
    const folder = await createDataset({
      name: 'export-folder',
      owner,
      type: DatasetTypeEnum.folder
    });
    const child = await createDataset({
      name: 'folder-child',
      owner,
      parentId: String(folder._id)
    });
    await createFileCollection({
      name: 'folder-child-file',
      owner,
      datasetId: String(child._id)
    });

    const res = await StreamCall(handler, {
      auth: owner,
      query: { datasetId: String(folder._id) }
    });

    expect(res.error).toBe(DatasetErrEnum.exportFolderNotSupported);
  });
});
