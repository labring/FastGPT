import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { findTeamAppsByPublishedResource } from '@fastgpt/service/core/app/resourceLookup';

const teamId = new Types.ObjectId('65f000000000000000000071');
const otherTeamId = new Types.ObjectId('65f000000000000000000072');
const tmbId = new Types.ObjectId('65f000000000000000000073');
const appId = new Types.ObjectId('65f000000000000000000074');
const otherAppId = new Types.ObjectId('65f000000000000000000075');
const publishedVersionId = new Types.ObjectId('65f000000000000000000076');
const oldVersionId = new Types.ObjectId('65f000000000000000000077');
const otherTeamVersionId = new Types.ObjectId('65f000000000000000000078');

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
      ids: 'skill-1',
      projection: 'name'
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
});
