import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
