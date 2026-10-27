import { describe, expect, it } from 'vitest';
import { createWorkflowTemplateBundle } from '@fastgpt/web/core/workflow/template/bundle';
import { workflowBuilderSystemTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('createWorkflowTemplateBundle', () => {
  it.each([
    [
      'en',
      'Start',
      'Model used by this AI node',
      ['Greeting', 'Question regarding xxx', 'Other Questions']
    ],
    ['zh-CN', '流程开始', '该 AI 节点使用的模型', ['打招呼', '关于 xxx 的问题', '其他问题']],
    ['zh-Hant', '流程開始', '此 AI 節點使用的模型', ['打招呼', '關於 xxx 的問題', '其他問題']],
    [
      'ko-KR',
      '시작',
      '이 AI 노드에서 사용하는 모델',
      ['Greeting', 'Question regarding xxx', 'Other Questions']
    ],
    [
      'unknown',
      'Start',
      'Model used by this AI node',
      ['Greeting', 'Question regarding xxx', 'Other Questions']
    ]
  ] as const)(
    'assembles %s templates with translated labels and automation hints',
    (locale, name, hint, classificationDefaults) => {
      const bundle = createWorkflowTemplateBundle({ locale });
      expect(bundle.items).toHaveLength(25);
      expect(bundle.items.filter((item) => item.listed)).toHaveLength(21);
      const start = bundle.items.find(
        (item) => item.ref.kind === 'builtin' && item.ref.templateId === 'workflow-start'
      )!;
      expect(start.template.name).toBe(name);
      const ai = bundle.items.find(
        (item) => item.template.flowNodeType === FlowNodeTypeEnum.chatNode
      )!;
      expect(ai.automationMeta?.inputs?.[NodeInputKeyEnum.aiModelId]?.agentHint).toBe(hint);
      const classifier = bundle.items.find(
        (item) => item.template.flowNodeType === FlowNodeTypeEnum.classifyQuestion
      )!;
      expect(
        classifier.template.inputs.find((input) => input.key === NodeInputKeyEnum.agents)?.value
      ).toEqual([
        { key: 'wqre', value: classificationDefaults[0] },
        { key: 'sdfa', value: classificationDefaults[1] },
        { key: 'agex', value: classificationDefaults[2] }
      ]);
      expect(
        workflowBuilderSystemTemplates
          .find((item) => item.template.flowNodeType === FlowNodeTypeEnum.classifyQuestion)!
          .template.inputs.find((input) => input.key === NodeInputKeyEnum.agents)?.value
      ).toEqual([
        { key: 'wqre', value: 'workflow:question_classification_default_1' },
        { key: 'sdfa', value: 'workflow:question_classification_default_2' },
        { key: 'agex', value: 'workflow:question_classification_default_3' }
      ]);
      const internal = bundle.items.filter(
        (item) => item.ref.kind === 'builtin' && item.ref.templateId.startsWith('__')
      );
      expect(internal).toHaveLength(3);
      expect(internal.every((item) => item.listed === false)).toBe(true);
      expect(
        bundle.items.find((item) => item.template.flowNodeType === FlowNodeTypeEnum.queryExtension)
      ).toMatchObject({ listed: false, automationMeta: { availableForWorkflowBuilder: false } });
    }
  );

  it('preserves authorized tool identity, defaults and literal values across JSON transport', () => {
    const systemTemplate = workflowBuilderSystemTemplates.find(
      (item) => item.templateId === 'workflow-start'
    )!.template;
    const tool = {
      ref: { kind: 'systemTool' as const, toolId: 'weather', source: 'debug:member' },
      template: {
        ...systemTemplate,
        id: 'weather',
        pluginId: 'weather',
        source: 'debug:member',
        flowNodeType: FlowNodeTypeEnum.tool,
        hasSystemSecret: true,
        unique: false,
        name: 'Weather',
        inputs: systemTemplate.inputs.map((input) => ({
          ...input,
          value: 'workflow:template.workflow_start',
          list: [
            { label: '', value: 'literal' },
            { label: 'common:core.module.input.label.user question', value: 'question' }
          ]
        }))
      },
      automationMeta: {},
      validatedInputDefaults: { query: { provided: true as const, value: false } }
    };
    const inputDefaults = {
      'builtin:ai-chat': {
        [NodeInputKeyEnum.aiModelId]: { provided: true as const, value: 'authorized-model' }
      }
    };
    const bundle = JSON.parse(
      JSON.stringify(
        createWorkflowTemplateBundle({ locale: 'zh-CN', items: [tool], inputDefaults })
      )
    );
    const ai = bundle.items.find(
      (item: { template: { flowNodeType: string } }) =>
        item.template.flowNodeType === FlowNodeTypeEnum.chatNode
    );
    expect(ai.validatedInputDefaults).toEqual(inputDefaults['builtin:ai-chat']);
    expect(bundle.items.at(-1)).toMatchObject({
      ref: tool.ref,
      template: {
        pluginId: 'weather',
        source: 'debug:member',
        name: 'Weather',
        inputs: [
          {
            value: 'workflow:template.workflow_start',
            list: [
              { label: '', value: 'literal' },
              { label: '用户问题', value: 'question' }
            ]
          }
        ]
      },
      automationMeta: {},
      validatedInputDefaults: tool.validatedInputDefaults
    });
    expect(tool.template.inputs[0].label).toBe(systemTemplate.inputs[0].label);
    expect(tool.template.hasSystemSecret).toBe(true);
    expect(bundle.items.at(-1).template).not.toHaveProperty('hasSystemSecret');
    expect(bundle.items[0].template.name).toBe('流程开始');
    expect(systemTemplate.name).toBe('workflow:template.workflow_start');
  });
});
