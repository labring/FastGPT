import { describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { DbRecordCorruptedError } from '@fastgpt/dal/db/errors';
import { parseRepoRow, parseRepoRows } from '@fastgpt/dal/db/parse';
import {
  DatasetLegacySystemRootMetaReadSchema,
  DatasetPermissionLockReadSchema,
  DatasetPermissionSyncContextReadSchema
} from '@fastgpt/dal/db/repos/dataset/repo.type';
import {
  DatasetCollectionDatasetIdReadSchema,
  DatasetCollectionLegacySentinelReadSchema,
  DatasetCollectionTreeNodeReadSchema
} from '@fastgpt/dal/db/repos/datasetCollection/repo.type';
import { UserLookupReadSchema } from '@fastgpt/dal/db/repos/user/repo.type';
import {
  TeamMemberIdReadSchema,
  TeamMemberUserIdReadSchema
} from '@fastgpt/dal/db/repos/teamMember/repo.type';
import { MemberGroupIdReadSchema } from '@fastgpt/dal/db/repos/memberGroup/repo.type';
import { OrgIdReadSchema } from '@fastgpt/dal/db/repos/org/repo.type';

describe('API dataset DAL narrow read schemas', () => {
  it('normalizes dataset lock and legacy system root metadata while preserving optional semantics', () => {
    const datasetId = createEntityId();
    const teamId = createEntityId();

    expect(
      parseRepoRow({
        table: 'datasets',
        schema: DatasetPermissionLockReadSchema,
        row: {
          _id: { toString: () => datasetId },
          apiDatasetServer: {
            apiServer: { baseUrl: 'example.com/api' },
            permissionSync: true
          }
        }
      })
    ).toEqual({
      apiDatasetServer: {
        apiServer: { baseUrl: 'https://example.com/api' },
        permissionSync: true
      }
    });

    expect(
      parseRepoRow({
        table: 'datasets',
        schema: DatasetPermissionLockReadSchema,
        row: { _id: datasetId, apiDatasetServer: null }
      })
    ).toEqual({
      apiDatasetServer: undefined
    });

    expect(
      parseRepoRow({
        table: 'datasets',
        schema: DatasetPermissionSyncContextReadSchema,
        row: {
          _id: { toString: () => datasetId },
          tmbId: { toString: () => teamId },
          collectionPermissionEnabled: null,
          apiDatasetServer: {
            apiServer: { baseUrl: 'example.com/api' },
            permissionSync: true
          }
        }
      })
    ).toEqual({
      tmbId: teamId,
      collectionPermissionEnabled: undefined,
      apiDatasetServer: {
        apiServer: { baseUrl: 'https://example.com/api' },
        permissionSync: true
      }
    });

    expect(
      parseRepoRow({
        table: 'datasets',
        schema: DatasetLegacySystemRootMetaReadSchema,
        row: {
          _id: { toString: () => datasetId },
          teamId: { toString: () => teamId }
        }
      })
    ).toEqual({
      _id: datasetId,
      teamId,
      collectionPermissionEnabled: undefined
    });
  });

  it('fails fast with DbRecordCorruptedError on corrupted dataset lock record', () => {
    const logger = { error: vi.fn() };
    const datasetId = createEntityId();

    expect(() =>
      parseRepoRow({
        table: 'datasets',
        schema: DatasetPermissionLockReadSchema,
        row: { _id: datasetId, apiDatasetServer: 'corrupted' },
        logger
      })
    ).toThrow(DbRecordCorruptedError);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('normalizes collection tree, sentinel, and datasetId read projections', () => {
    const id1 = createEntityId();
    const id2 = createEntityId();
    const parentId = createEntityId();
    const teamId = createEntityId();
    const datasetId = createEntityId();

    expect(
      parseRepoRow({
        table: 'dataset_collections',
        schema: DatasetCollectionDatasetIdReadSchema,
        row: { _id: id1, datasetId: { toString: () => datasetId } }
      })
    ).toEqual({ datasetId });

    expect(
      parseRepoRows({
        table: 'dataset_collections',
        schema: DatasetCollectionTreeNodeReadSchema,
        rows: [
          {
            _id: { toString: () => id1 },
            parentId: { toString: () => parentId },
            inheritPermission: false
          },
          { _id: { toString: () => id2 }, parentId: undefined }
        ]
      })
    ).toEqual([
      { _id: id1, parentId, inheritPermission: false },
      { _id: id2, parentId: null, inheritPermission: undefined }
    ]);

    expect(
      parseRepoRows({
        table: 'dataset_collections',
        schema: DatasetCollectionLegacySentinelReadSchema,
        rows: [
          {
            _id: { toString: () => id1 },
            teamId: { toString: () => teamId },
            inheritPermission: null
          }
        ]
      })
    ).toEqual([{ _id: id1, teamId, inheritPermission: undefined }]);
  });

  it('normalizes subject lookup rows and skips corrupted list entries', () => {
    const logger = { error: vi.fn() };
    const id = createEntityId();
    const userId = createEntityId();

    expect(
      parseRepoRows({
        table: 'users',
        schema: UserLookupReadSchema,
        rows: [
          { _id: { toString: () => userId }, username: 'alice' },
          { _id: 'not-an-object-id', username: 'broken' }
        ],
        logger
      })
    ).toEqual([{ _id: userId, username: 'alice' }]);
    expect(logger.error).toHaveBeenCalledTimes(1);

    expect(
      parseRepoRows({
        table: 'team_members',
        schema: TeamMemberUserIdReadSchema,
        rows: [{ _id: { toString: () => id }, userId: { toString: () => userId } }]
      })
    ).toEqual([{ _id: id, userId }]);

    expect(
      parseRepoRows({
        table: 'team_members',
        schema: TeamMemberIdReadSchema,
        rows: [{ _id: { toString: () => id } }]
      })
    ).toEqual([{ _id: id }]);

    expect(
      parseRepoRows({
        table: 'team_member_groups',
        schema: MemberGroupIdReadSchema,
        rows: [{ _id: { toString: () => id } }]
      })
    ).toEqual([{ _id: id }]);

    expect(
      parseRepoRows({
        table: 'team_orgs',
        schema: OrgIdReadSchema,
        rows: [{ _id: { toString: () => id } }]
      })
    ).toEqual([{ _id: id }]);
  });
});
