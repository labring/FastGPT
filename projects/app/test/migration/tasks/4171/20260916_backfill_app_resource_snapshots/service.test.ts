import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { decodeMcpToolSetNodesFromStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as appResourcePermission from '@fastgpt/service/support/permission/app/resource';
import {
  backfillAppResourceRecords,
  backfillAppVersionResourceRecords,
  buildAppResourceSnapshot,
  validateAppResourceRecords,
  validateAppVersionResourceRecords
} from '@/migration/tasks/4171/20260916_backfill_app_resource_snapshots/service';

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
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockImplementation(
      async ({ resources }) => resources
    );
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
    vi.spyOn(appResourcePermission, 'getUnauthorizedAppResources').mockResolvedValue([]);
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

  it('silently filters unauthorized resources when creator member lacks permissions', async () => {
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockResolvedValue([
      { type: 'skill', id: 'legacy-skill' }
    ]);
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
    await MongoApp.collection.insertOne(app);

    await expect(backfillAppResourceRecords([app])).resolves.toMatchObject({
      updatedCount: 1,
      createdVersionCount: 1,
      failures: []
    });

    const createdVersion = await MongoAppVersion.collection.findOne({ appId: app._id });
    expect(createdVersion?.resources).toEqual([{ type: 'skill', id: 'legacy-skill' }]);
  });

  it('drops all resources to empty array when member cannot be found or is invalid', async () => {
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockResolvedValue([]);
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
    const version = createVersion({
      appId: app._id,
      nodes: [
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
    await Promise.all([
      MongoApp.collection.insertOne(app),
      MongoAppVersion.collection.insertOne(version)
    ]);

    // Stage 1: versions backfill drops all resources to []
    await expect(backfillAppVersionResourceRecords([version])).resolves.toMatchObject({
      updatedCount: 1,
      failures: []
    });
    const updatedVersion = await MongoAppVersion.collection.findOne({ _id: version._id });
    expect(updatedVersion?.resources).toEqual([]);
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
      expect.objectContaining({ message: expect.stringContaining('invalid_type') })
    ]);

    const invalidVersion = createVersion({
      appId: app._id,
      resources: [{ type: 'invalid_type', id: 'foo' }]
    });
    expect(validateAppVersionResourceRecords([invalidVersion])).toEqual([
      expect.objectContaining({ message: expect.stringContaining('invalid_union') })
    ]);
    await expect(validateAppResourceRecords([app, folder])).resolves.toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ _id: app._id }),
        message: 'App published Version pointer is still missing or invalid'
      })
    ]);
  });

  it('aggregates legacy MCP child apps into parent published Version and skips child apps', async () => {
    const parentApp = createApp({
      name: 'Legacy MCP ToolSet',
      avatar: '/mcp-parent.png',
      type: AppTypeEnum.mcpToolSet,
      modules: []
    });

    const childApp1 = createApp({
      name: 'search',
      intro: 'Search tool',
      parentId: parentApp._id,
      modules: [
        {
          inputs: [
            {
              value: {
                name: 'search',
                description: 'Search description',
                url: 'https://mcp.example.com/sse',
                headerSecret: { Authorization: { value: 'tok-auth' } },
                inputSchema: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                  required: ['query']
                }
              }
            }
          ]
        }
      ]
    });

    const childApp2 = createApp({
      name: 'fetch',
      intro: 'Fetch tool',
      parentId: parentApp._id,
      modules: [
        {
          inputs: [
            {
              value: {
                name: 'fetch',
                description: 'Fetch description',
                url: 'https://mcp.example.com/sse',
                headerSecret: { value: 'single-token' },
                inputSchema: {
                  type: 'object',
                  properties: { url: { type: 'string' } },
                  required: ['url']
                }
              }
            }
          ]
        }
      ]
    });

    await MongoApp.collection.insertMany([parentApp, childApp1, childApp2]);

    const batch = [parentApp, childApp1, childApp2];
    const result = await backfillAppResourceRecords(batch);

    expect(result).toMatchObject({
      updatedCount: 1,
      createdVersionCount: 1,
      failures: []
    });

    const [migratedParent, parentVersions, child1Versions, child2Versions] = await Promise.all([
      MongoApp.collection.findOne({ _id: parentApp._id }),
      MongoAppVersion.collection.find({ appId: parentApp._id }).toArray(),
      MongoAppVersion.collection.find({ appId: childApp1._id }).toArray(),
      MongoAppVersion.collection.find({ appId: childApp2._id }).toArray()
    ]);

    expect(migratedParent?.publishedVersionId).toBeDefined();
    expect(parentVersions).toHaveLength(1);
    expect(child1Versions).toHaveLength(0);
    expect(child2Versions).toHaveLength(0);

    const version = parentVersions[0];
    expect(String(version._id)).toBe(String(migratedParent?.publishedVersionId));
    expect(version.isPublish).toBe(true);

    const decodedNodes = decodeMcpToolSetNodesFromStorage(version.nodes);
    expect(decodedNodes).toHaveLength(1);
    expect(decodedNodes[0].toolConfig?.mcpToolSet).toMatchObject({
      url: 'https://mcp.example.com/sse',
      headerSecret: { Authorization: { value: 'tok-auth' } },
      toolList: [
        {
          name: 'search',
          description: 'Search description',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query']
          }
        },
        {
          name: 'fetch',
          description: 'Fetch description',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url']
          }
        }
      ]
    });

    await expect(
      validateAppResourceRecords([migratedParent!, childApp1, childApp2])
    ).resolves.toEqual([]);
  });
});
