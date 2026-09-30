import { beforeEach, describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import {
  countTeamAppsByPublishedResourceGroups,
  findTeamAppsByPublishedResource,
  getAppPublishedResourceType
} from '@fastgpt/service/core/app/resourceLookup';

const teamId = new Types.ObjectId('65f000000000000000000071');
const otherTeamId = new Types.ObjectId('65f000000000000000000072');
const tmbId = new Types.ObjectId('65f000000000000000000073');
const appId = new Types.ObjectId('65f000000000000000000074');
const otherAppId = new Types.ObjectId('65f000000000000000000075');
const publishedVersionId = new Types.ObjectId('65f000000000000000000076');
const oldVersionId = new Types.ObjectId('65f000000000000000000077');
const otherTeamVersionId = new Types.ObjectId('65f000000000000000000078');

describe('getAppPublishedResourceType', () => {
  it('maps tool and agent app types to published resource types', () => {
    expect(getAppPublishedResourceType(AppTypeEnum.tool)).toBe('tool');
    expect(getAppPublishedResourceType(AppTypeEnum.workflowTool)).toBe('tool');
    expect(getAppPublishedResourceType(AppTypeEnum.workflow)).toBe('agent');
  });

  it('returns undefined for unsupported app types', () => {
    expect(getAppPublishedResourceType('unknown')).toBeUndefined();
  });
});

describe('findTeamAppsByPublishedResource', () => {
  beforeEach(async () => {
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('only counts resources from the current published version in the same team', async () => {
    await MongoApp.collection.insertMany([
      {
        _id: appId,
        teamId,
        tmbId,
        name: 'Current app',
        type: 'workflow',
        publishedVersionId,
        deleteTime: null
      },
      {
        _id: otherAppId,
        teamId: otherTeamId,
        tmbId,
        name: 'Other team app',
        type: 'workflow',
        publishedVersionId: otherTeamVersionId,
        deleteTime: null
      }
    ]);
    await MongoAppVersion.collection.insertMany([
      {
        _id: oldVersionId,
        appId,
        tmbId,
        time: new Date('2026-08-01T00:00:00.000Z'),
        isPublish: true,
        resources: [{ type: 'skill', id: 'removed-skill' }]
      },
      {
        _id: publishedVersionId,
        appId,
        tmbId,
        time: new Date('2026-08-20T00:00:00.000Z'),
        isPublish: true,
        resources: [
          { type: 'skill', id: 'skill-1' },
          { type: 'skill', id: 'skill-1' }
        ]
      },
      {
        _id: otherTeamVersionId,
        appId: otherAppId,
        tmbId,
        time: new Date('2026-08-20T00:00:00.000Z'),
        isPublish: true,
        resources: [{ type: 'skill', id: 'skill-1' }]
      }
    ]);

    const { apps, counts } = await findTeamAppsByPublishedResource({
      teamId: String(teamId),
      type: 'skill',
      ids: 'skill-1'
    });

    expect(apps.map((app) => String(app._id))).toEqual([String(appId)]);
    expect(apps[0]).toMatchObject({ name: 'Current app' });
    expect(counts.get('skill-1')).toBe(1);
    const removed = await findTeamAppsByPublishedResource({
      teamId: String(teamId),
      type: 'skill',
      ids: 'removed-skill'
    });
    expect(removed.apps).toHaveLength(0);
  });

  it('counts each app once when a folder group contains multiple referenced resources', async () => {
    const secondAppId = new Types.ObjectId('65f000000000000000000079');
    const secondVersionId = new Types.ObjectId('65f000000000000000000080');
    await MongoApp.collection.insertMany([
      {
        _id: appId,
        teamId,
        tmbId,
        name: 'App using two children',
        type: 'workflow',
        publishedVersionId,
        deleteTime: null
      },
      {
        _id: secondAppId,
        teamId,
        tmbId,
        name: 'App using one child',
        type: 'workflow',
        publishedVersionId: secondVersionId,
        deleteTime: null
      }
    ]);
    await MongoAppVersion.collection.insertMany([
      {
        _id: publishedVersionId,
        appId,
        tmbId,
        time: new Date(),
        isPublish: true,
        resources: [
          { type: 'dataset', id: 'child-1' },
          { type: 'dataset', id: 'child-2' }
        ]
      },
      {
        _id: secondVersionId,
        appId: secondAppId,
        tmbId,
        time: new Date(),
        isPublish: true,
        resources: [{ type: 'dataset', id: 'child-2' }]
      }
    ]);

    const folderNodes = [
      { _id: 'child-1', parentId: 'folder-1', type: 'dataset' },
      { _id: 'child-2', parentId: 'folder-1', type: 'dataset' }
    ];
    const counts = await countTeamAppsByPublishedResourceGroups({
      teamId: String(teamId),
      resourceGroups: [
        { id: 'folder-1', isOwner: true, resources: [], folderId: 'folder-1' },
        { id: 'child-2', isOwner: true, resources: [{ type: 'dataset', id: 'child-2' }] },
        { id: 'non-owner', isOwner: false, resources: [{ type: 'dataset', id: 'child-2' }] }
      ],
      fetchChildren: async (parentIds) =>
        folderNodes.filter((node) => node.parentId && parentIds.includes(String(node.parentId))),
      shouldTraverse: () => false,
      getResource: (node) => ({ type: 'dataset', id: String(node._id) })
    });

    expect(counts.get('non-owner')).toBeUndefined();
    expect(counts.get('child-2')).toBe(2);
  });

  it('counts an app once when its published version references multiple resource types in a group', async () => {
    const agentOnlyAppId = new Types.ObjectId('65f000000000000000000081');
    const agentOnlyVersionId = new Types.ObjectId('65f000000000000000000082');
    await MongoApp.collection.insertMany([
      {
        _id: appId,
        teamId,
        tmbId,
        name: 'App using an app and a tool',
        type: 'workflow',
        publishedVersionId,
        deleteTime: null
      },
      {
        _id: agentOnlyAppId,
        teamId,
        tmbId,
        name: 'App using an app',
        type: 'workflow',
        publishedVersionId: agentOnlyVersionId,
        deleteTime: null
      }
    ]);
    await MongoAppVersion.collection.insertMany([
      {
        _id: publishedVersionId,
        appId,
        tmbId,
        time: new Date(),
        isPublish: true,
        resources: [
          { type: 'agent', id: 'app-child' },
          { type: 'tool', id: 'tool-child' }
        ]
      },
      {
        _id: agentOnlyVersionId,
        appId: agentOnlyAppId,
        tmbId,
        time: new Date(),
        isPublish: true,
        resources: [{ type: 'agent', id: 'app-child' }]
      }
    ]);

    const folderNodes = [
      { _id: 'app-child', parentId: 'folder-1', type: 'workflow' },
      { _id: 'tool-child', parentId: 'folder-1', type: 'tool' }
    ];
    const counts = await countTeamAppsByPublishedResourceGroups({
      teamId: String(teamId),
      resourceGroups: [
        { id: 'folder-1', isOwner: true, resources: [], folderId: 'folder-1' },
        { id: 'app-child', isOwner: true, resources: [{ type: 'agent', id: 'app-child' }] }
      ],
      fetchChildren: async (parentIds) =>
        folderNodes.filter((node) => node.parentId && parentIds.includes(String(node.parentId))),
      shouldTraverse: () => false,
      getResource: (node) => {
        const id = String(node._id);
        return node.type === 'tool' ? { type: 'tool', id } : { type: 'agent', id };
      }
    });

    expect(counts.get('folder-1')).toBe(2);
    expect(counts.get('app-child')).toBe(2);
  });
});
