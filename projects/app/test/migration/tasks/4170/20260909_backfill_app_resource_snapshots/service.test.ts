import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backfillAppResourceRecords,
  backfillAppVersionResourceRecords,
  buildAppResourceSnapshot,
  validateAppResourceRecords,
  validateAppVersionResourceRecords
} from '@/migration/tasks/4170/20260909_backfill_app_resource_snapshots/service';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const teamId = new Types.ObjectId('65f000000000000000000071');
const tmbId = new Types.ObjectId('65f000000000000000000072');

const createApp = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  teamId,
  tmbId,
  name: 'Legacy app',
  type: 'advanced',
  modules: [],
  edges: [],
  chatConfig: {},
  resourceRefs: { skillIds: ['legacy-skill'] },
  ...overrides
});

const createVersion = ({
  appId,
  ...overrides
}: { appId: Types.ObjectId } & Record<string, unknown>) => ({
  _id: new Types.ObjectId(),
  appId,
  tmbId,
  time: new Date('2026-08-20T00:00:00.000Z'),
  isPublish: true,
  nodes: [],
  edges: [],
  chatConfig: {},
  resourceRefs: { skillIds: ['published-skill'] },
  ...overrides
});

describe('App resource snapshot migration service', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('normalizes legacy workflow nodes and preserves legacy Skill references', () => {
    const snapshot = buildAppResourceSnapshot({
      _id: new Types.ObjectId(),
      modules: [
        {
          id: 'react-flow-node-id',
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      resourceRefs: { skillIds: ['legacy-skill'] }
    });

    expect(snapshot.normalizedWorkflow.nodes).toEqual([
      {
        nodeId: 'node-1',
        flowNodeType: 'workflowStart',
        name: 'Start',
        inputs: [],
        outputs: []
      }
    ]);
    expect(snapshot.resources).toContainEqual({ type: 'skill', id: 'legacy-skill' });
    expect(snapshot.legacySkillMismatches).toBe(0);
  });

  it('accepts a concurrent Version update when it already produced a legal snapshot', async () => {
    const app = createApp();
    const version = createVersion({ appId: app._id });
    await MongoAppVersion.collection.insertOne(version);
    const originalUpdateOne = MongoAppVersion.collection.updateOne.bind(MongoAppVersion.collection);
    let changed = false;
    vi.spyOn(MongoAppVersion.collection, 'updateOne').mockImplementation(
      async (filter, update, options) => {
        if (!changed) {
          changed = true;
          await originalUpdateOne(
            { _id: version._id },
            { $set: { nodes: [{ nodeId: 'new' }], resources: [] } }
          );
        }
        return originalUpdateOne(filter, update, options);
      }
    );

    await expect(backfillAppVersionResourceRecords([version])).resolves.toMatchObject({
      updatedCount: 0,
      failures: []
    });
  });

  it('rolls back a generated Version when the pointer compare-and-set fails', async () => {
    const app = createApp();
    await MongoApp.collection.insertOne(app);
    const originalUpdateOne = MongoApp.collection.updateOne.bind(MongoApp.collection);
    vi.spyOn(MongoApp.collection, 'updateOne').mockImplementation(
      async (filter, update, options) => {
        if ('$set' in update && 'publishedVersionId' in (update.$set ?? {})) {
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 0
          } as never;
        }
        return originalUpdateOne(filter, update, options);
      }
    );

    await expect(backfillAppResourceRecords([app])).resolves.toMatchObject({
      updatedCount: 0,
      createdVersionCount: 0,
      failures: [expect.objectContaining({ record: app })]
    });
    await expect(MongoAppVersion.countDocuments({ appId: app._id })).resolves.toBe(0);
  });

  it('creates a published Version from the legacy App workflow when drafts already exist', async () => {
    const app = createApp({
      modules: [
        {
          nodeId: 'legacy-agent-node',
          flowNodeType: 'appModule',
          name: 'Legacy agent',
          pluginId: 'legacy-agent-id',
          inputs: [],
          outputs: []
        }
      ]
    });
    const draft = createVersion({
      appId: app._id,
      isPublish: false,
      isAutoSave: true,
      resources: []
    });
    await Promise.all([
      MongoApp.collection.insertOne(app),
      MongoAppVersion.collection.insertOne(draft)
    ]);

    await expect(validateAppResourceRecords([app])).resolves.toEqual([
      expect.objectContaining({ message: 'App still has no published Version' })
    ]);
    await expect(backfillAppResourceRecords([app])).resolves.toMatchObject({
      updatedCount: 1,
      createdVersionCount: 1,
      failures: []
    });

    const [migratedApp, versions] = await Promise.all([
      MongoApp.collection.findOne({ _id: app._id }),
      MongoAppVersion.collection.find({ appId: app._id }).toArray()
    ]);
    expect(versions).toHaveLength(2);
    expect(versions).toContainEqual(expect.objectContaining({ _id: draft._id, isAutoSave: true }));
    expect(versions).toContainEqual(
      expect.objectContaining({
        _id: migratedApp?.publishedVersionId,
        isPublish: true,
        nodes: [expect.objectContaining({ nodeId: 'legacy-agent-node' })],
        resources: [
          { type: 'agent', id: 'legacy-agent-id' },
          { type: 'skill', id: 'legacy-skill' }
        ]
      })
    );
    await expect(validateAppResourceRecords([migratedApp!])).resolves.toEqual([]);
  });

  it('validates missing snapshots, invalid pointers, missing published Versions, and folders', async () => {
    const app = createApp();
    const folder = createApp({ type: 'folder' });
    const version = createVersion({ appId: app._id });
    await Promise.all([
      MongoApp.collection.insertMany([app, folder]),
      MongoAppVersion.collection.insertOne(version)
    ]);

    expect(validateAppVersionResourceRecords([version])).toEqual([
      expect.objectContaining({ message: 'App Version resources are still missing or invalid' })
    ]);
    await expect(validateAppResourceRecords([app, folder])).resolves.toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ _id: app._id }),
        message: 'App published Version pointer is still missing or invalid'
      })
    ]);
  });
});
