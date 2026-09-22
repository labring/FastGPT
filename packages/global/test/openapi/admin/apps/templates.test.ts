import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  CreateTemplateBodySchema,
  UpdateTemplateBodySchema,
  GetAdminTemplatesResponseSchema
} from '@fastgpt/global/openapi/admin/app/templates/api';
import { AdminTemplatePath } from '@fastgpt/global/openapi/admin/app/templates';
import { AdminTemplateTypePath } from '@fastgpt/global/openapi/admin/app/templateType';

const templateBase = {
  name: 'Template',
  intro: 'Template intro',
  avatar: 'template-avatar',
  tags: []
};

const workflow = {
  nodes: [
    {
      nodeId: 'start',
      flowNodeType: 'workflowStart',
      name: 'Start',
      inputs: [],
      outputs: []
    }
  ],
  edges: [],
  chatConfig: {}
};

const simpleWorkflow = {
  aiSettings: {
    model: 'gpt-4o-mini',
    isResponseAnswerText: true,
    maxHistories: 6
  },
  dataset: {
    datasets: [],
    searchMode: 'embedding'
  },
  selectedTools: [],
  chatConfig: {}
};

describe('admin app template schemas', () => {
  it('accepts a canonical workflow template', () => {
    expect(
      CreateTemplateBodySchema.parse({
        ...templateBase,
        type: AppTypeEnum.workflow,
        workflow
      }).workflow
    ).toEqual(workflow);
  });

  it('rejects an unsupported workflow node type', () => {
    expect(
      CreateTemplateBodySchema.safeParse({
        ...templateBase,
        type: AppTypeEnum.workflow,
        workflow: {
          ...workflow,
          nodes: [{ ...workflow.nodes[0], flowNodeType: 'removedNodeType' }]
        }
      }).success
    ).toBe(false);
  });

  it('strips unknown fields from workflow templates', () => {
    const result = CreateTemplateBodySchema.parse({
      ...templateBase,
      type: AppTypeEnum.workflow,
      workflow: {
        ...workflow,
        nodes: [
          {
            ...workflow.nodes[0],
            inputs: [
              {
                key: 'model',
                label: 'Model',
                renderTypeList: ['input'],
                llmModelType: 'chat'
              }
            ]
          }
        ],
        chatConfig: { _id: 'legacy-id' }
      }
    });

    expect(result.workflow).not.toHaveProperty('chatConfig._id');
    expect(result.workflow).not.toHaveProperty('nodes.0.inputs.0.llmModelType');
  });

  it('strips unknown chat config fields from simple templates', () => {
    const result = CreateTemplateBodySchema.parse({
      ...templateBase,
      type: AppTypeEnum.simple,
      workflow: {
        ...simpleWorkflow,
        chatConfig: { _id: 'legacy-id' }
      }
    });

    expect(result.workflow).not.toHaveProperty('chatConfig._id');
  });

  it('requires type and workflow to be updated together', () => {
    expect(
      UpdateTemplateBodySchema.safeParse({
        templateId: 'commercial-template',
        workflow
      }).success
    ).toBe(false);
    expect(
      UpdateTemplateBodySchema.safeParse({
        templateId: 'commercial-template',
        isActive: true
      }).success
    ).toBe(true);
  });

  it('rejects a workflow that does not match the updated template type', () => {
    expect(
      UpdateTemplateBodySchema.safeParse({
        templateId: 'commercial-template',
        type: AppTypeEnum.simple,
        workflow
      }).success
    ).toBe(false);
  });

  it('configures proper OpenAPI response schemas for template routes', () => {
    const listRoute = AdminTemplatePath['/proApi/admin/app/templates/list']?.get;
    expect(listRoute?.responses?.[200]?.content?.['application/json']?.schema).toBe(
      GetAdminTemplatesResponseSchema
    );

    for (const route of [
      AdminTemplatePath['/proApi/admin/app/templates/create']?.post,
      AdminTemplatePath['/proApi/admin/app/templates/update']?.put,
      AdminTemplatePath['/proApi/admin/app/templates/delete']?.delete,
      AdminTemplatePath['/proApi/admin/app/templates/updateOrder']?.put,
      AdminTemplatePath['/proApi/admin/app/templates/updateQuickTemplate']?.put,
      AdminTemplateTypePath['/proApi/admin/app/templateType/save']?.post,
      AdminTemplateTypePath['/proApi/admin/app/templateType/delete']?.delete,
      AdminTemplateTypePath['/proApi/admin/app/templateType/updateOrder']?.put
    ]) {
      expect(route?.responses?.[200]).toBeDefined();
      expect(route?.responses?.[200]?.content).toBeUndefined();
    }
  });
});
