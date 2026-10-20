import { beforeEach, describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import {
  countTeamAppsByResourceGroups,
  findTeamAppsByResource,
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
const crossAppPointerAppId = new Types.ObjectId('65f000000000000000000087');
const draftVersionId = new Types.ObjectId('65f000000000000000000083');
const oldDraftVersionId = new Types.ObjectId('65f000000000000000000084');
const draftOnlyAppId = new Types.ObjectId('65f000000000000000000085');
const draftOnlyVersionId = new Types.ObjectId('65f000000000000000000086');

describe('getAppPublishedResourceType', () => {
  it('maps tool and agent app types to resource types', () => {
    expect(getAppPublishedResourceType(AppTypeEnum.tool)).toBe('tool');
    expect(getAppPublishedResourceType(AppTypeEnum.workflowTool)).toBe('tool');
    expect(getAppPublishedResourceType(AppTypeEnum.workflow)).toBe('agent');
  });

  it('returns undefined for unsupported app types', () => {
    expect(getAppPublishedResourceType('unknown')).toBeUndefined();
  });
});

describe('findTeamAppsByResource', () => {
  beforeEach(async () => {
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('only counts resources from the current version in the same team', async () => {
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
      },
      {
        _id: crossAppPointerAppId,
        teamId,
        tmbId,
        name: 'Cross-app pointer app',
        type: 'workflow',
        publishedVersionId,
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

    const { apps, counts } = await findTeamAppsByResource({
      teamId: String(teamId),
      type: 'skill',
      ids: 'skill-1'
    });

    expect(apps.map((app) => String(app._id))).toEqual([String(appId)]);
    expect(apps[0]).toMatchObject({ name: 'Current app' });
    expect(counts.get('skill-1')).toBe(1);
    const removed = await findTeamAppsByResource({
      teamId: String(teamId),
      type: 'skill',
      ids: 'removed-skill'
    });
    expect(removed.apps).toHaveLength(0);
  });

  it('counts the latest saved draft and published version as a unique app union', async () => {
    await MongoApp.collection.insertMany([
      {
        _id: appId,
        teamId,
        tmbId,
        name: 'Draft and published app',
        type: 'workflow',
        publishedVersionId,
        deleteTime: null
      },
      {
        _id: draftOnlyAppId,
        teamId,
        tmbId,
        name: 'Draft-only app',
        type: 'workflow',
        deleteTime: null
      }
    ]);
    await MongoAppVersion.collection.insertMany([
      {
        _id: oldDraftVersionId,
        appId,
        tmbId,
        time: new Date('2026-08-10T00:00:00.000Z'),
        isPublish: false,
        isAutoSave: true,
        resources: [{ type: 'skill', id: 'stale-draft-skill' }]
      },
      {
        _id: publishedVersionId,
        appId,
        tmbId,
        time: new Date('2026-08-20T00:00:00.000Z'),
        isPublish: true,
        resources: [{ type: 'skill', id: 'published-skill' }]
      },
      {
        _id: draftVersionId,
        appId,
        tmbId,
        time: new Date('2026-08-30T00:00:00.000Z'),
        isPublish: false,
        isAutoSave: true,
        resources: [{ type: 'skill', id: 'draft-skill' }]
      },
      {
        _id: draftOnlyVersionId,
        appId: draftOnlyAppId,
        tmbId,
        time: new Date('2026-08-30T00:00:00.000Z'),
        isPublish: false,
        isAutoSave: true,
        resources: [{ type: 'skill', id: 'draft-only-skill' }]
      }
    ]);

    const bothVersions = await findTeamAppsByResource({
      teamId: String(teamId),
      type: 'skill',
      ids: ['published-skill', 'draft-skill']
    });
    expect(bothVersions.apps.map((app) => String(app._id))).toEqual([String(appId)]);
    expect(bothVersions.counts.get('published-skill')).toBe(1);
    expect(bothVersions.counts.get('draft-skill')).toBe(1);

    const draftOnly = await findTeamAppsByResource({
      teamId: String(teamId),
      type: 'skill',
      ids: 'draft-only-skill'
    });
    expect(draftOnly.apps.map((app) => String(app._id))).toEqual([String(draftOnlyAppId)]);
    expect(draftOnly.counts.get('draft-only-skill')).toBe(1);

    const staleDraft = await findTeamAppsByResource({
      teamId: String(teamId),
      type: 'skill',
      ids: 'stale-draft-skill'
    });
    expect(staleDraft.apps).toHaveLength(0);
    expect(staleDraft.counts.get('stale-draft-skill')).toBeUndefined();
  });

  it('counts each app once per resource group and omits empty or non-owner groups', async () => {
    const secondAppId = new Types.ObjectId('65f000000000000000000079');
    const secondVersionId = new Types.ObjectId('65f000000000000000000080');
    await MongoApp.collection.insertMany([
      {
        _id: appId,
        teamId,
        tmbId,
        name: 'App using two datasets',
        type: 'workflow',
        publishedVersionId,
        deleteTime: null
      },
      {
        _id: secondAppId,
        teamId,
        tmbId,
        name: 'App using one dataset',
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
          { type: 'dataset', id: 'dataset-1' },
          { type: 'dataset', id: 'dataset-2' }
        ]
      },
      {
        _id: secondVersionId,
        appId: secondAppId,
        tmbId,
        time: new Date(),
        isPublish: true,
        resources: [{ type: 'dataset', id: 'dataset-2' }]
      }
    ]);

    const counts = await countTeamAppsByResourceGroups({
      teamId: String(teamId),
      resourceGroups: [
        { id: 'empty-group', isOwner: true, resources: [] },
        {
          id: 'dataset-group',
          isOwner: true,
          resources: [
            { type: 'dataset', id: 'dataset-1' },
            { type: 'dataset', id: 'dataset-2' }
          ]
        },
        { id: 'non-owner', isOwner: false, resources: [{ type: 'dataset', id: 'dataset-2' }] }
      ]
    });

    expect(counts.get('empty-group')).toBeUndefined();
    expect(counts.get('non-owner')).toBeUndefined();
    expect(counts.get('dataset-group')).toBe(2);
  });

  it('counts an app once when its versions reference multiple resource types in a group', async () => {
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

    const counts = await countTeamAppsByResourceGroups({
      teamId: String(teamId),
      resourceGroups: [
        {
          id: 'mixed-resources',
          isOwner: true,
          resources: [
            { type: 'agent', id: 'app-child' },
            { type: 'tool', id: 'tool-child' }
          ]
        },
        { id: 'app-child', isOwner: true, resources: [{ type: 'agent', id: 'app-child' }] }
      ]
    });

    expect(counts.get('mixed-resources')).toBe(2);
    expect(counts.get('app-child')).toBe(2);
  });
  it('counts all 101 published references independently of the detail cap', async () => {
    const appRecords = Array.from({ length: 101 }, () => ({
      appId: new Types.ObjectId(),
      versionId: new Types.ObjectId()
    }));
    await MongoApp.collection.insertMany(
      appRecords.map(({ appId, versionId }, index) => ({
        _id: appId,
        teamId,
        tmbId,
        name: `Referencing app ${index}`,
        type: 'workflow',
        publishedVersionId: versionId,
        deleteTime: null
      }))
    );
    await MongoAppVersion.collection.insertMany(
      appRecords.map(({ appId, versionId }) => ({
        _id: versionId,
        appId,
        tmbId,
        time: new Date(),
        isPublish: true,
        resources: [{ type: 'dataset', id: 'dataset-1' }]
      }))
    );

    const counts = await countTeamAppsByResourceGroups({
      teamId: String(teamId),
      resourceGroups: [
        {
          id: 'dataset-1',
          isOwner: true,
          resources: [{ type: 'dataset', id: 'dataset-1' }]
        }
      ]
    });

    expect(counts.get('dataset-1')).toBe(101);
  });
});
