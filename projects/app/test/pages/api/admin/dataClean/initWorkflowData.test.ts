import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
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
  formatWorkflowDocument,
  runInitWorkflowDataMigration
} from '@/pages/api/admin/dataClean/initWorkflowData';

const teamId = '65f000000000000000000051';
const tmbId = '65f000000000000000000052';
const appId = '65f000000000000000000053';

const dirtyV2Nodes = [
  {
    nodeId: 'start',
    flowNodeType: FlowNodeTypeEnum.workflowStart,
    name: 'Start',
    inputs: null,
    outputs: [
      {
        key: 'userChatInput',
        type: 'FlowNodeOutputTypeEnum.static',
        valueType: 'WorkflowIOValueTypeEnum.string'
      }
    ]
  },
  {
    moduleId: 'legacy-laf',
    flowNodeType: 'lafModule',
    name: null,
    inputs: [
      {
        key: 'hidden',
        label: null,
        renderTypeList: ['FlowNodeInputTypeEnum.hidden'],
        valueType: 'WorkflowIOValueTypeEnum.string',
        description: null
      }
    ],
    outputs: []
  }
];

describe('initWorkflowData data clean API', () => {
  beforeEach(async () => {
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('formats dirty v2 workflow data and keeps save schema valid', () => {
    const stats = {
      collectionName: 'apps',
      fieldName: 'modules',
      queryMatchedDocumentCount: null,
      scannedDocumentCount: 0,
      fixableDocumentCount: 0,
      unknownDocumentCount: 0,
      enumExpressionCount: 0,
      renderTypeListFixableCount: 0,
      outputTypeFixableCount: 0,
      valueTypeFixableCount: 0,
      unknownEnumExpressionCount: 0,
      saveApiValidationErrorDocumentCount: 0,
      cleanErrorDocumentCount: 0,
      formatChangedDocumentCount: 0,
      writeSuccessDocumentCount: 0,
      writeBlockedDocumentCount: 0,
      writeErrorDocumentCount: 0,
      byExpression: {},
      validationIssuesByPath: {},
      samples: []
    };
    const result = formatWorkflowDocument({
      doc: {
        _id: appId,
        modules: dirtyV2Nodes,
        edges: null,
        chatConfig: {
          questionGuide: true,
          variables: [
            {
              key: 'topic',
              label: 'topic',
              type: 'string',
              enums: '[{\"value\":\"a\"}]',
              maxLength: -1
            }
          ],
          scheduledTriggerConfig: null
        }
      },
      fieldName: 'modules',
      stats,
      docContext: {
        collectionName: 'apps',
        documentId: appId
      },
      rootPath: 'modules',
      sampleSize: 20
    });

    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'legacy-laf',
          flowNodeType: FlowNodeTypeEnum.emptyNode,
          inputs: expect.arrayContaining([
            expect.objectContaining({
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.string,
              label: 'hidden'
            })
          ])
        }),
        expect.objectContaining({
          outputs: expect.arrayContaining([
            expect.objectContaining({
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.string
            })
          ])
        })
      ])
    );
    expect(result.edges).toEqual([]);
    expect(result.chatConfig).toMatchObject({
      questionGuide: { open: true },
      variables: [
        {
          type: 'input',
          description: '',
          enums: [{ value: 'a', label: 'a' }]
        }
      ]
    });
    expect(result.chatConfig).not.toHaveProperty('scheduledTriggerConfig');
    expect(result.formatChanges.length).toBeGreaterThan(0);
  });

  it('dry-runs without writing formatted data', async () => {
    await MongoApp.create({
      _id: appId,
      teamId,
      tmbId,
      name: 'dirty app',
      type: AppTypeEnum.workflow,
      version: 'v2',
      modules: dirtyV2Nodes,
      edges: null,
      chatConfig: null
    });

    const result = await runInitWorkflowDataMigration({
      dryRun: true
    });

    expect(result.apps).toMatchObject({
      scannedDocumentCount: 1,
      fixableDocumentCount: 1,
      saveApiValidationErrorDocumentCount: 0,
      formatChangedDocumentCount: 1,
      writeSuccessDocumentCount: 0
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      modules: expect.arrayContaining([expect.objectContaining({ flowNodeType: 'lafModule' })]),
      chatConfig: null
    });
  });

  it('writes only formatted and zod-valid documents', async () => {
    await MongoApp.create({
      _id: appId,
      teamId,
      tmbId,
      name: 'dirty app',
      type: AppTypeEnum.workflow,
      version: 'v2',
      modules: dirtyV2Nodes,
      edges: null,
      chatConfig: null
    });

    const result = await runInitWorkflowDataMigration({
      dryRun: false
    });

    expect(result.apps).toMatchObject({
      scannedDocumentCount: 1,
      fixableDocumentCount: 1,
      saveApiValidationErrorDocumentCount: 0,
      writeSuccessDocumentCount: 1
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      modules: expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'legacy-laf',
          flowNodeType: FlowNodeTypeEnum.emptyNode
        })
      ]),
      edges: [],
      chatConfig: {}
    });
  });

  it('blocks writes when formatted data still fails zod parse', async () => {
    await MongoApp.create({
      _id: appId,
      teamId,
      tmbId,
      name: 'invalid app',
      type: AppTypeEnum.workflow,
      version: 'v2',
      modules: dirtyV2Nodes,
      edges: [],
      chatConfig: {
        variables: ['invalid']
      }
    });

    const result = await runInitWorkflowDataMigration({
      dryRun: false
    });

    expect(result.apps).toMatchObject({
      scannedDocumentCount: 1,
      saveApiValidationErrorDocumentCount: 1,
      writeBlockedDocumentCount: 1,
      writeSuccessDocumentCount: 0
    });
    expect(result.zodErrors[0]).toMatchObject({
      collectionName: 'apps',
      fieldName: 'modules',
      stage: 'saveApi'
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      modules: expect.arrayContaining([expect.objectContaining({ flowNodeType: 'lafModule' })])
    });
  });
});
