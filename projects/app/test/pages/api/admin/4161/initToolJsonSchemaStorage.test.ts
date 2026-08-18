import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

import handler, {
  runToolJsonSchemaStorageMigration
} from '@/pages/api/admin/4161/initToolJsonSchemaStorage';

const teamId = '65f000000000000000000071';
const tmbId = '65f000000000000000000072';
const appId = '65f000000000000000000073';
const workflowAppId = '65f000000000000000000074';

const createLegacyNode = () => ({
  nodeId: 'tool-set',
  toolConfig: {
    mcpToolSet: {
      toolList: [{ inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema' } }]
    },
    httpToolSet: {
      toolList: [
        {
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          requestSchema: { type: 'object' },
          responseSchema: { type: 'object' },
          secretSchema: { type: 'object' }
        }
      ]
    }
  }
});

const createNormalizedManualHttpNode = () => ({
  nodeId: 'normalized-http-tool-set',
  toolConfig: {
    httpToolSet: {
      toolList: [
        {
          inputSchema: {
            type: 'object',
            properties: {
              values: {
                type: 'array',
                items: { type: 'string' },
                description: 'Normalized values'
              }
            }
          }
        }
      ]
    }
  }
});

const createLegacyManualHttpNode = () => ({
  nodeId: 'legacy-http-tool-set',
  toolConfig: {
    httpToolSet: {
      toolList: [
        {
          inputSchema: {
            type: 'object',
            properties: {
              values: {
                type: WorkflowIOValueTypeEnum.arrayString,
                description: 'Legacy values'
              }
            }
          }
        }
      ]
    }
  }
});

describe('initToolJsonSchemaStorage migration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue(undefined);
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('defaults to dry-run and does not change historical data', async () => {
    await MongoApp.collection.insertOne({
      _id: appId as any,
      teamId,
      tmbId,
      name: 'Legacy toolset',
      type: 'mcpToolSet',
      modules: [createLegacyNode()]
    });

    const result = await handler({ body: {} } as any);
    const stored = await MongoApp.collection.findOne({ _id: appId as any });

    expect(mocks.authCert).toHaveBeenCalledWith({ req: expect.anything(), authRoot: true });
    expect(result).toMatchObject({
      dryRun: true,
      apps: { changedDocumentCount: 1, modifiedDocumentCount: 0, convertedSchemaCount: 6 }
    });
    expect(typeof (stored?.modules as any[])[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toBe(
      'object'
    );
  });

  it('cleans app and version schemas through raw collections', async () => {
    await MongoApp.collection.insertOne({
      _id: appId as any,
      teamId,
      tmbId,
      name: 'Legacy toolset',
      type: 'mcpToolSet',
      modules: [createLegacyNode()]
    });
    await MongoAppVersion.collection.insertOne({
      appId: appId as any,
      tmbId,
      time: new Date(),
      versionName: 'v1',
      nodes: [createLegacyNode()]
    });

    const result = await runToolJsonSchemaStorageMigration({ dryRun: false, batchSize: 1 });
    const app = await MongoApp.collection.findOne({ _id: appId as any });
    const version = await MongoAppVersion.collection.findOne({ appId: appId as any });

    expect(result.total).toEqual({
      scannedDocumentCount: 2,
      changedDocumentCount: 2,
      modifiedDocumentCount: 2,
      convertedSchemaCount: 12
    });
    expect(typeof (app?.modules as any[])[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toBe(
      'string'
    );
    expect(
      typeof (version?.nodes as any[])[0].toolConfig.httpToolSet.toolList[0].requestSchema
    ).toBe('string');
  });

  it('stores schemas already normalized by the 4.16.0 migration', async () => {
    await MongoApp.collection.insertOne({
      _id: appId as any,
      teamId,
      tmbId,
      name: 'Normalized HTTP toolset',
      type: 'httpToolSet',
      modules: [createNormalizedManualHttpNode()]
    });
    await MongoAppVersion.collection.insertOne({
      appId: appId as any,
      tmbId,
      time: new Date(),
      versionName: 'v1',
      nodes: [createNormalizedManualHttpNode()]
    });

    const result = await runToolJsonSchemaStorageMigration({ dryRun: false, batchSize: 1 });
    const app = await MongoApp.collection.findOne({ _id: appId as any });
    const version = await MongoAppVersion.collection.findOne({ appId: appId as any });
    const appInputSchema = (app?.modules as any[])[0].toolConfig.httpToolSet.toolList[0]
      .inputSchema;
    const versionInputSchema = (version?.nodes as any[])[0].toolConfig.httpToolSet.toolList[0]
      .inputSchema;

    expect(result.total).toMatchObject({
      scannedDocumentCount: 2,
      changedDocumentCount: 2,
      modifiedDocumentCount: 2,
      convertedSchemaCount: 2
    });
    expect(typeof appInputSchema).toBe('string');
    expect(JSON.parse(appInputSchema).properties.values).toEqual({
      type: 'array',
      items: { type: 'string' },
      description: 'Normalized values'
    });
    expect(typeof versionInputSchema).toBe('string');
  });

  it('rejects legacy HTTP array schemas before writing any document', async () => {
    await MongoApp.collection.insertOne({
      _id: appId as any,
      teamId,
      tmbId,
      name: 'Normalized HTTP toolset',
      type: 'httpToolSet',
      modules: [createNormalizedManualHttpNode()]
    });
    await MongoAppVersion.collection.insertOne({
      appId: appId as any,
      tmbId,
      time: new Date(),
      versionName: 'v1',
      nodes: [createLegacyManualHttpNode()]
    });

    await expect(
      runToolJsonSchemaStorageMigration({ dryRun: false, batchSize: 1 })
    ).rejects.toThrow('请先完成 4.16.0 initHttpToolSchema 迁移');

    const app = await MongoApp.collection.findOne({ _id: appId as any });
    const version = await MongoAppVersion.collection.findOne({ appId: appId as any });
    expect(typeof (app?.modules as any[])[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe(
      'object'
    );
    expect(typeof (version?.nodes as any[])[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe(
      'object'
    );
  });

  it('does not apply the 4.16.0 gate to workflow apps', async () => {
    await MongoApp.collection.insertOne({
      _id: workflowAppId as any,
      teamId,
      tmbId,
      name: 'Workflow app',
      type: AppTypeEnum.workflow,
      modules: [createLegacyManualHttpNode()]
    });
    await MongoAppVersion.collection.insertOne({
      appId: workflowAppId as any,
      tmbId,
      time: new Date(),
      versionName: 'v1',
      nodes: [createLegacyManualHttpNode()]
    });

    const result = await runToolJsonSchemaStorageMigration({ dryRun: false, batchSize: 1 });
    const app = await MongoApp.collection.findOne({ _id: workflowAppId as any });
    const version = await MongoAppVersion.collection.findOne({ appId: workflowAppId as any });

    expect(result.total).toMatchObject({
      scannedDocumentCount: 2,
      changedDocumentCount: 2,
      modifiedDocumentCount: 2,
      convertedSchemaCount: 2
    });
    expect(typeof (app?.modules as any[])[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe(
      'string'
    );
    expect(typeof (version?.nodes as any[])[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe(
      'string'
    );
  });
});
