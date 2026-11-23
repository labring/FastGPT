import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AuditResourceTypeEnum } from '@fastgpt/global/support/user/audit/type';

const { mockGetDatasetCollectionPaths, mockFindTags } = vi.hoisted(() => ({
  mockGetDatasetCollectionPaths: vi.fn(),
  mockFindTags: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/paths', () => ({
  getDatasetCollectionPaths: mockGetDatasetCollectionPaths
}));

vi.mock('@fastgpt/service/core/dataset/tag/schemaV2', () => ({
  MongoDatasetCollectionTagsV2: {
    find: mockFindTags
  }
}));

import {
  buildCollectionCreateAuditLog,
  buildCollectionExportAuditLog,
  buildCollectionTagAuditLogs,
  buildCollectionUpdateAuditChanges
} from '@fastgpt/service/core/dataset/audit/collection';

const collection = { name: 'source:file', forbid: false };

describe('buildCollectionUpdateAuditChanges', () => {
  it('skips omitted and unchanged attributes', () => {
    expect(buildCollectionUpdateAuditChanges({ collection, update: {} })).toEqual([]);
    expect(
      buildCollectionUpdateAuditChanges({
        collection,
        update: { name: collection.name, forbid: false }
      })
    ).toEqual([]);
    expect(buildCollectionUpdateAuditChanges({ collection, update: { name: '' } })).toEqual([]);
  });

  it('keeps separate rename, status and move snapshots in one update', () => {
    expect(
      buildCollectionUpdateAuditChanges({
        collection,
        update: { name: 'target:file', forbid: true },
        move: { oldPath: 'docs/source/source:file', newPath: 'docs/target/target:file' }
      })
    ).toEqual([
      {
        event: DatasetAuditEventEnum.DATASET_COLLECTION_RENAME,
        params: {
          oldName: 'source:file',
          newName: 'target:file'
        }
      },
      {
        event: DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE,
        params: {}
      },
      {
        event: DatasetAuditEventEnum.DATASET_COLLECTION_MOVE,
        params: {
          oldPath: 'docs/source/source:file',
          newPath: 'docs/target/target:file'
        }
      }
    ]);
  });

  it('records enabling a disabled collection', () => {
    expect(
      buildCollectionUpdateAuditChanges({
        collection: { ...collection, forbid: true },
        update: { forbid: false }
      })
    ).toEqual([
      {
        event: DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE,
        params: {}
      }
    ]);
  });
});

describe('buildCollectionCreateAuditLog', () => {
  beforeEach(() => {
    mockGetDatasetCollectionPaths.mockReset();
  });

  it('assembles matching resource snapshot, objectType and location from one collection type', async () => {
    mockGetDatasetCollectionPaths.mockResolvedValueOnce([
      { parentId: 'folder-1', parentName: '指南' }
    ]);

    const log = await buildCollectionCreateAuditLog({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      dataset: {
        _id: '507f1f77bcf86cd799439011',
        teamId: 'team-1',
        name: '产品手册'
      },
      collection: {
        _id: '507f1f77bcf86cd799439012',
        name: '接入说明.txt',
        type: DatasetCollectionTypeEnum.file,
        parentId: 'folder-1'
      }
    });

    expect(log).toEqual({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      event: DatasetAuditEventEnum.DATASET_COLLECTION_CREATE,
      resources: [
        {
          type: AuditResourceTypeEnum.collection,
          id: '507f1f77bcf86cd799439012',
          name: '接入说明.txt',
          datasetId: '507f1f77bcf86cd799439011',
          collectionType: DatasetCollectionTypeEnum.file
        }
      ],
      params: {
        objectType: 'common:core.dataset.file',
        location: '产品手册/指南'
      }
    });
  });

  it('marks folder collections as collectionFolder and falls back to dataset name on path errors', async () => {
    mockGetDatasetCollectionPaths.mockRejectedValueOnce(new Error('db unavailable'));

    const log = await buildCollectionCreateAuditLog({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      dataset: {
        _id: '507f1f77bcf86cd799439011',
        teamId: 'team-1',
        name: '产品手册'
      },
      collection: {
        _id: '507f1f77bcf86cd799439013',
        name: '归档目录',
        type: DatasetCollectionTypeEnum.folder,
        parentId: 'folder-1'
      }
    });

    expect(log.resources).toEqual([
      {
        type: AuditResourceTypeEnum.collectionFolder,
        id: '507f1f77bcf86cd799439013',
        name: '归档目录',
        datasetId: '507f1f77bcf86cd799439011',
        collectionType: DatasetCollectionTypeEnum.folder
      }
    ]);
    expect(log.params).toEqual({
      objectType: 'common:core.dataset.folder',
      location: '产品手册'
    });
  });
});

describe('buildCollectionExportAuditLog', () => {
  it('builds source-read and qa-export audit logs with resource teamId', () => {
    expect(
      buildCollectionExportAuditLog({
        tmbId: 'tmb-1',
        collection: {
          _id: '507f1f77bcf86cd799439012',
          teamId: 'team-resource',
          datasetId: '507f1f77bcf86cd799439011',
          name: '指南.pdf',
          type: DatasetCollectionTypeEnum.file
        },
        event: DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ
      })
    ).toEqual({
      teamId: 'team-resource',
      tmbId: 'tmb-1',
      event: DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ,
      resources: [
        {
          type: AuditResourceTypeEnum.collection,
          id: '507f1f77bcf86cd799439012',
          name: '指南.pdf',
          datasetId: '507f1f77bcf86cd799439011',
          collectionType: DatasetCollectionTypeEnum.file
        }
      ],
      params: {}
    });
  });
});

describe('buildCollectionTagAuditLogs', () => {
  beforeEach(() => {
    mockFindTags.mockReset();
  });

  it('returns empty without querying tags when no tag changed', async () => {
    const logs = await buildCollectionTagAuditLogs({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      datasetId: '507f1f77bcf86cd799439011',
      changes: [
        {
          collection: { _id: '507f1f77bcf86cd799439012', name: '指南.pdf' },
          addedTagIds: [],
          removedTagIds: []
        }
      ]
    });

    expect(logs).toEqual([]);
    expect(mockFindTags).not.toHaveBeenCalled();
  });

  it('resolves tag names in one deduplicated query and falls back to tagId when missing or failed', async () => {
    mockFindTags.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce([{ _id: 'tag-1', tag: '部门' }])
    });

    const logs = await buildCollectionTagAuditLogs({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      datasetId: '507f1f77bcf86cd799439011',
      changes: [
        {
          collection: {
            _id: '507f1f77bcf86cd799439012',
            name: '新文件名.pdf',
            type: DatasetCollectionTypeEnum.file
          },
          addedTagIds: ['tag-1', 'tag-missing'],
          removedTagIds: ['tag-1']
        }
      ]
    });

    expect(mockFindTags).toHaveBeenCalledWith(
      {
        _id: { $in: ['tag-1', 'tag-missing'] },
        teamId: 'team-1',
        datasetId: '507f1f77bcf86cd799439011'
      },
      'tag'
    );
    expect(logs).toEqual([
      {
        tmbId: 'tmb-1',
        teamId: 'team-1',
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
        resources: [
          {
            type: AuditResourceTypeEnum.collection,
            id: '507f1f77bcf86cd799439012',
            name: '新文件名.pdf',
            datasetId: '507f1f77bcf86cd799439011',
            collectionType: DatasetCollectionTypeEnum.file
          }
        ],
        params: {
          tagName: '部门, tag-missing'
        }
      },
      {
        tmbId: 'tmb-1',
        teamId: 'team-1',
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE,
        resources: [
          {
            type: AuditResourceTypeEnum.collection,
            id: '507f1f77bcf86cd799439012',
            name: '新文件名.pdf',
            datasetId: '507f1f77bcf86cd799439011',
            collectionType: DatasetCollectionTypeEnum.file
          }
        ],
        params: {
          tagName: '部门'
        }
      }
    ]);

    mockFindTags.mockReturnValueOnce({
      lean: vi.fn().mockRejectedValueOnce(new Error('db unavailable'))
    });
    const fallbackLogs = await buildCollectionTagAuditLogs({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      datasetId: '507f1f77bcf86cd799439011',
      changes: [
        {
          collection: { _id: '507f1f77bcf86cd799439012', name: '指南.pdf' },
          addedTagIds: ['tag-1'],
          removedTagIds: []
        }
      ]
    });
    expect(fallbackLogs[0]?.params).toEqual({
      tagName: 'tag-1'
    });
  });
});
