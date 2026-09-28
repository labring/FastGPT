import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MemberRateLimitPolicy } from '@fastgpt/service/common/rateLimit/interface/member';

const mocks = vi.hoisted(() => ({
  assertDatasetArchiveCollectionsReadable: vi.fn(),
  assertMemberRateLimit: vi.fn(),
  authDataset: vi.fn(),
  createDatasetArchiveTicket: vi.fn(),
  prepareDatasetArchive: vi.fn(),
  withDatasetArchiveResources: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: vi.fn((handler) => handler) }));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/member', async (importOriginal) => ({
  ...(await importOriginal()),
  assertMemberRateLimit: mocks.assertMemberRateLimit
}));
vi.mock('@/service/core/dataset/collection/archive', () => ({
  assertDatasetArchiveCollectionsReadable: mocks.assertDatasetArchiveCollectionsReadable,
  prepareDatasetArchive: mocks.prepareDatasetArchive,
  withDatasetArchiveResources: mocks.withDatasetArchiveResources
}));
vi.mock('@/service/core/dataset/collection/archiveTicket', () => ({
  createDatasetArchiveTicket: mocks.createDatasetArchiveTicket
}));
vi.mock('@/service/common/s3/proxy', () => ({
  createS3ProxyAbortContext: vi.fn(() => ({
    signal: new AbortController().signal,
    cleanup: vi.fn()
  }))
}));

import handler from '@/pages/api/core/dataset/collection/getDownloadTicket';

const datasetId = '68ad85a7463006c963799b01';
const collectionIds = ['68ad85a7463006c963799a05'];
const manifest = { directories: [], files: [] };

const createRequest = (body = { datasetId, collectionIds }) =>
  Object.assign(new EventEmitter(), { body });

describe('POST /core/dataset/collection/getDownloadTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authDataset.mockResolvedValue({
      dataset: {
        _id: datasetId,
        name: 'Knowledge Base',
        type: DatasetTypeEnum.dataset
      },
      teamId: 'team-1',
      tmbId: 'member-1',
      isRoot: true
    });
    mocks.withDatasetArchiveResources.mockImplementation(async ({ fn }) =>
      fn({ signals: [new AbortController().signal], assertValid: vi.fn() })
    );
    mocks.prepareDatasetArchive.mockResolvedValue(manifest);
    mocks.createDatasetArchiveTicket.mockResolvedValue({
      ticket: 'ticket-1',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
  });

  it('authenticates the dataset and prepares a ticket under archive resources', async () => {
    const response = await handler(createRequest() as any, new EventEmitter() as any);

    expect(mocks.authDataset).toHaveBeenCalledWith({
      req: expect.anything(),
      authToken: true,
      authApiKey: true,
      datasetId,
      per: ReadPermissionVal
    });
    expect(mocks.assertMemberRateLimit).toHaveBeenCalledWith({
      policy: MemberRateLimitPolicy.DownloadDatasetArchive,
      memberId: 'member-1'
    });
    expect(mocks.prepareDatasetArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        datasetId,
        datasetName: 'Knowledge Base',
        collectionIds
      })
    );
    expect(mocks.createDatasetArchiveTicket).toHaveBeenCalledWith({
      tmbId: 'member-1',
      teamId: 'team-1',
      datasetId,
      manifest
    });
    expect(response).toEqual({ ticket: 'ticket-1', expiresAt: '2026-09-22T10:00:00.000Z' });
  });

  it('holds archive resources and consumes the rate limit before expensive preparation', async () => {
    const events: string[] = [];
    mocks.withDatasetArchiveResources.mockImplementationOnce(async ({ fn }) => {
      events.push('lease');
      return fn({ signals: [new AbortController().signal], assertValid: vi.fn() });
    });
    mocks.assertMemberRateLimit.mockImplementationOnce(async () => {
      events.push('rate-limit');
    });
    mocks.prepareDatasetArchive.mockImplementationOnce(async () => {
      events.push('prepare');
      return manifest;
    });

    await handler(createRequest() as any, new EventEmitter() as any);

    expect(events).toEqual(['lease', 'rate-limit', 'prepare']);
  });

  it('rejects unsupported dataset types before acquiring archive resources', async () => {
    mocks.authDataset.mockResolvedValueOnce({
      dataset: { _id: datasetId, name: 'Website', type: DatasetTypeEnum.websiteDataset },
      teamId: 'team-1',
      tmbId: 'member-1',
      isRoot: true
    });

    await expect(handler(createRequest() as any, new EventEmitter() as any)).rejects.toBe(
      DatasetErrEnum.archiveUnsupportedDataset
    );
    expect(mocks.withDatasetArchiveResources).not.toHaveBeenCalled();
  });

  it('does not create a ticket when preparation fails', async () => {
    const error = new Error('prepare failed');
    mocks.prepareDatasetArchive.mockRejectedValueOnce(error);

    await expect(handler(createRequest() as any, new EventEmitter() as any)).rejects.toBe(error);
    expect(mocks.createDatasetArchiveTicket).not.toHaveBeenCalled();
  });
});
