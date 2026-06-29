import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn()
}));

import {
  runV1WorkflowToV2Migration,
  upgradeV1WorkflowDocument
} from '@/pages/api/admin/dataClean/v1WorkflowToV2';

const teamId = '65f000000000000000000041';
const tmbId = '65f000000000000000000042';
const appId = '65f000000000000000000043';

const legacyV1Nodes = [
  {
    moduleId: 'start',
    flowType: 'questionInput',
    name: '开始',
    inputs: [
      {
        key: 'userChatInput',
        type: 'input',
        valueType: 'string'
      }
    ],
    outputs: [
      {
        key: 'userChatInput',
        type: 'source',
        valueType: 'string',
        targets: [{ moduleId: 'chat', key: 'userChatInput' }]
      }
    ]
  },
  {
    moduleId: 'chat',
    flowType: 'chatNode',
    inputs: [
      {
        key: 'userChatInput',
        type: 'target',
        valueType: 'chat_history'
      },
      {
        key: 'dirty',
        type: 'hidden',
        valueType: 'tools',
        description: null,
        toolDescription: null
      }
    ],
    outputs: [
      {
        key: 'answer',
        type: 'answer',
        valueType: 'kb_quote'
      }
    ]
  },
  {
    moduleId: 'legacy-laf',
    flowType: 'lafModule',
    inputs: [],
    outputs: []
  }
];

describe('v1WorkflowToV2 data clean API', () => {
  beforeEach(async () => {
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('converts one legacy v1 workflow document and keeps it publish-schema valid', () => {
    const result = upgradeV1WorkflowDocument({
      config: {
        key: 'apps',
        collectionName: 'apps',
        fieldName: 'modules'
      },
      doc: {
        _id: appId,
        type: AppTypeEnum.workflow,
        version: 'v1',
        modules: legacyV1Nodes,
        edges: [],
        chatConfig: {
          questionGuide: true,
          variables: [
            {
              key: 'topic',
              label: 'topic',
              type: 'select',
              list: [{ value: 'a' }]
            }
          ],
          scheduledTriggerConfig: null
        }
      }
    });

    expect(result.converted).toBe(true);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart
        }),
        expect.objectContaining({
          nodeId: 'chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: expect.arrayContaining([
            expect.objectContaining({
              key: 'userChatInput',
              valueType: WorkflowIOValueTypeEnum.chatHistory,
              value: ['start', 'userChatInput']
            }),
            expect.objectContaining({
              key: 'dirty',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.any,
              description: '',
              toolDescription: ''
            })
          ]),
          outputs: expect.arrayContaining([
            expect.objectContaining({
              key: 'answer',
              valueType: WorkflowIOValueTypeEnum.datasetQuote
            })
          ])
        }),
        expect.objectContaining({
          nodeId: 'legacy-laf',
          flowNodeType: FlowNodeTypeEnum.emptyNode
        })
      ])
    );
    expect(result.chatConfig).toMatchObject({
      questionGuide: { open: true },
      variables: [
        {
          description: '',
          list: [{ value: 'a', label: 'a' }]
        }
      ]
    });
    expect(result.chatConfig).not.toHaveProperty('scheduledTriggerConfig');
  });

  it('dry-runs apps and app_versions without writing converted data', async () => {
    await MongoApp.create({
      _id: appId,
      teamId,
      tmbId,
      name: 'legacy app',
      type: AppTypeEnum.workflow,
      version: 'v1',
      modules: legacyV1Nodes,
      edges: [],
      chatConfig: null
    });
    await MongoAppVersion.create({
      appId,
      tmbId,
      nodes: legacyV1Nodes,
      edges: [],
      chatConfig: null
    });

    const result = await runV1WorkflowToV2Migration({
      dryRun: true
    });

    expect(result).toMatchObject({
      dryRun: true,
      apps: {
        scannedDocumentCount: 1,
        convertedDocumentCount: 1,
        zodErrorDocumentCount: 0,
        writeSuccessDocumentCount: 0
      },
      appVersions: {
        scannedDocumentCount: 1,
        convertedDocumentCount: 1,
        zodErrorDocumentCount: 0,
        writeSuccessDocumentCount: 0
      }
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      version: 'v1',
      modules: expect.arrayContaining([expect.objectContaining({ flowType: 'questionInput' })]),
      chatConfig: null
    });
  });

  it('writes app_versions before apps and marks apps v2 only after zod validation', async () => {
    await MongoApp.create({
      _id: appId,
      teamId,
      tmbId,
      name: 'legacy app',
      type: AppTypeEnum.workflow,
      version: 'v1',
      modules: legacyV1Nodes,
      edges: [],
      chatConfig: {
        variables: [{ key: 'invalid-variable' }]
      }
    });
    await MongoAppVersion.create({
      appId,
      tmbId,
      nodes: legacyV1Nodes,
      edges: [],
      chatConfig: null
    });

    const result = await runV1WorkflowToV2Migration({
      dryRun: false
    });

    expect(result.apps).toMatchObject({
      scannedDocumentCount: 1,
      convertedDocumentCount: 1,
      zodErrorDocumentCount: 1,
      writeBlockedDocumentCount: 1,
      writeSuccessDocumentCount: 0
    });
    expect(result.appVersions).toMatchObject({
      scannedDocumentCount: 1,
      convertedDocumentCount: 1,
      zodErrorDocumentCount: 0,
      writeSuccessDocumentCount: 1
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      version: 'v1',
      modules: expect.arrayContaining([expect.objectContaining({ flowType: 'questionInput' })])
    });
    await expect(MongoAppVersion.findOne({ appId }).lean()).resolves.toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart
        })
      ]),
      chatConfig: {}
    });
  });
});
