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
  formatManualHttpToolSchemas,
  runInitHttpToolSchemaMigration
} from '@/pages/api/admin/4160/initHttpToolSchema';

const teamId = '65f000000000000000000061';
const tmbId = '65f000000000000000000062';
const appId = '65f000000000000000000063';
const workflowAppId = '65f000000000000000000064';

const createHttpToolSetNode = ({
  apiSchemaStr,
  propertyType
}: {
  apiSchemaStr?: string;
  propertyType: string;
}) => ({
  nodeId: `http-tool-${propertyType}`,
  toolConfig: {
    httpToolSet: {
      ...(apiSchemaStr !== undefined ? { apiSchemaStr } : {}),
      toolList: [
        {
          name: 'search',
          description: 'Search',
          path: '/search',
          method: 'POST',
          inputSchema: {
            type: 'object',
            required: ['values'],
            properties: {
              values: {
                type: propertyType,
                description: 'Search values',
                'x-tool-description': 'Values provided by the model'
              }
            }
          }
        }
      ]
    }
  }
});

describe('initHttpToolSchema migration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue(undefined);
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('formats only manual HTTP tool legacy arrays and preserves property metadata', () => {
    const manualNode = createHttpToolSetNode({
      propertyType: WorkflowIOValueTypeEnum.arrayString
    });
    const batchNode = createHttpToolSetNode({
      apiSchemaStr: '',
      propertyType: WorkflowIOValueTypeEnum.arrayNumber
    });
    const nodes = [manualNode, batchNode];

    const result = formatManualHttpToolSchemas(nodes);

    expect(result).toMatchObject({
      changed: true,
      convertedPropertyCount: 1
    });
    expect((result.nodes as any[])[0]).toMatchObject({
      toolConfig: {
        httpToolSet: {
          toolList: [
            {
              inputSchema: {
                properties: {
                  values: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Search values',
                    'x-tool-description': 'Values provided by the model'
                  }
                }
              }
            }
          ]
        }
      }
    });
    expect((result.nodes as any[])[1]).toBe(batchNode);
  });

  it('dry-runs without writing either collection', async () => {
    await MongoApp.create({
      _id: appId,
      teamId,
      tmbId,
      name: 'HTTP tools',
      type: AppTypeEnum.httpToolSet,
      version: 'v2',
      modules: [
        createHttpToolSetNode({
          propertyType: WorkflowIOValueTypeEnum.arrayString
        })
      ],
      edges: [],
      chatConfig: {}
    });
    await MongoAppVersion.create({
      appId,
      tmbId,
      versionName: 'v1',
      nodes: [
        createHttpToolSetNode({
          propertyType: WorkflowIOValueTypeEnum.arrayBoolean
        })
      ],
      edges: [],
      chatConfig: {}
    });

    const result = await runInitHttpToolSchemaMigration({
      dryRun: true,
      batchSize: 1
    });

    expect(result).toMatchObject({
      apps: {
        scannedDocumentCount: 1,
        changedDocumentCount: 1,
        modifiedDocumentCount: 0,
        convertedPropertyCount: 1
      },
      appVersions: {
        scannedDocumentCount: 1,
        changedDocumentCount: 1,
        modifiedDocumentCount: 0,
        convertedPropertyCount: 1
      },
      total: {
        changedDocumentCount: 2,
        convertedPropertyCount: 2
      }
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      modules: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                {
                  inputSchema: {
                    properties: {
                      values: { type: WorkflowIOValueTypeEnum.arrayString }
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    });
  });

  it('writes current and version schemas and is idempotent', async () => {
    await MongoApp.create([
      {
        _id: appId,
        teamId,
        tmbId,
        name: 'HTTP tools',
        type: AppTypeEnum.httpToolSet,
        version: 'v2',
        modules: [
          createHttpToolSetNode({
            propertyType: WorkflowIOValueTypeEnum.arrayNumber
          }),
          createHttpToolSetNode({
            apiSchemaStr: '{"openapi":"3.0.0"}',
            propertyType: WorkflowIOValueTypeEnum.arrayBoolean
          })
        ],
        edges: [],
        chatConfig: {}
      },
      {
        _id: workflowAppId,
        teamId,
        tmbId,
        name: 'Workflow app',
        type: AppTypeEnum.workflow,
        version: 'v2',
        modules: [
          createHttpToolSetNode({
            propertyType: WorkflowIOValueTypeEnum.arrayBoolean
          })
        ],
        edges: [],
        chatConfig: {}
      }
    ]);
    await MongoAppVersion.create([
      {
        appId,
        tmbId,
        versionName: 'v1',
        nodes: [
          createHttpToolSetNode({
            propertyType: WorkflowIOValueTypeEnum.arrayString
          })
        ],
        edges: [],
        chatConfig: {}
      },
      {
        appId: workflowAppId,
        tmbId,
        versionName: 'workflow-v1',
        nodes: [
          createHttpToolSetNode({
            propertyType: WorkflowIOValueTypeEnum.arrayBoolean
          })
        ],
        edges: [],
        chatConfig: {}
      }
    ]);

    const firstResult = await runInitHttpToolSchemaMigration({
      dryRun: false,
      batchSize: 10
    });

    expect(firstResult.total).toMatchObject({
      scannedDocumentCount: 2,
      changedDocumentCount: 2,
      modifiedDocumentCount: 2,
      convertedPropertyCount: 2
    });
    const app = await MongoApp.findById(appId).lean();
    expect(app?.modules[0]).toMatchObject({
      toolConfig: {
        httpToolSet: {
          toolList: [
            {
              inputSchema: {
                properties: {
                  values: {
                    type: 'array',
                    items: { type: 'number' }
                  }
                }
              }
            }
          ]
        }
      }
    });
    expect(app?.modules[1]).toMatchObject({
      toolConfig: {
        httpToolSet: {
          toolList: [
            {
              inputSchema: {
                properties: {
                  values: { type: WorkflowIOValueTypeEnum.arrayBoolean }
                }
              }
            }
          ]
        }
      }
    });
    await expect(MongoAppVersion.findOne({ appId }).lean()).resolves.toMatchObject({
      nodes: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                {
                  inputSchema: {
                    properties: {
                      values: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    });
    await expect(MongoApp.findById(workflowAppId).lean()).resolves.toMatchObject({
      modules: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                {
                  inputSchema: {
                    properties: {
                      values: { type: WorkflowIOValueTypeEnum.arrayBoolean }
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    });
    await expect(MongoAppVersion.findOne({ appId: workflowAppId }).lean()).resolves.toMatchObject({
      nodes: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                {
                  inputSchema: {
                    properties: {
                      values: { type: WorkflowIOValueTypeEnum.arrayBoolean }
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    });

    const secondResult = await runInitHttpToolSchemaMigration({
      dryRun: false,
      batchSize: 10
    });
    expect(secondResult.total).toMatchObject({
      changedDocumentCount: 0,
      modifiedDocumentCount: 0,
      convertedPropertyCount: 0
    });
  });

  it('authenticates root and defaults the request to dry-run', async () => {
    const req = { body: {} } as any;

    await expect(handler(req)).resolves.toMatchObject({
      dryRun: true,
      batchSize: 500
    });
    expect(mocks.authCert).toHaveBeenCalledWith({ req, authRoot: true });
  });
});
