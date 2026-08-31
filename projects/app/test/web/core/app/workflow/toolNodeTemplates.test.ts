import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { normalizeFlowNodeInputType } from '@fastgpt/global/core/app/formEdit/utils';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion';
import { CustomFeedbackNode } from '@fastgpt/global/core/workflow/template/system/customFeedback';
import { CodeNode } from '@fastgpt/global/core/workflow/template/system/sandbox';
import { ReadFilesNode } from '@fastgpt/global/core/workflow/template/system/readFiles';
import { TextEditorNode } from '@fastgpt/global/core/workflow/template/system/textEditor';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { IfElseNode } from '@fastgpt/global/core/workflow/template/system/ifElse';
import { ParallelRunNode } from '@fastgpt/global/core/workflow/template/system/parallelRun/parallelRun';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { CanonicalWorkflowDataSchema } from '@fastgpt/global/core/workflow/migration';
import { PublishAppBodySchema } from '@fastgpt/global/openapi/core/app/version/api';
import {
  getInputComponentProps,
  nodeTemplate2FlowNode,
  storeNode2FlowNode
} from '@/web/core/workflow/utils';
import { uiWorkflow2StoreWorkflow } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { hasDynamicToolInput } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderToolInput';

describe('workflow tool node templates', () => {
  it('marks supported nodes as tool-connectable', () => {
    expect(
      [
        ClassifyQuestionModule,
        ToolCallNode,
        TextEditorNode,
        ReadFilesNode,
        IfElseNode,
        ParallelRunNode,
        LoopRunNode,
        CustomFeedbackNode,
        CodeNode
      ].every((template) => template.isTool === true)
    ).toBe(true);
  });

  it('keeps requested AI-generated defaults explicit', () => {
    // 用户输入和文件链接默认 AI 生成；背景知识、提示词和聊天记录保留用户手动配置。
    (
      [
        [ClassifyQuestionModule, NodeInputKeyEnum.userChatInput],
        [ToolCallNode, NodeInputKeyEnum.fileUrlList],
        [ToolCallNode, NodeInputKeyEnum.userChatInput],
        [ReadFilesNode, NodeInputKeyEnum.fileUrlList]
      ] as const
    ).forEach(([template, key]) => {
      expect(template.inputs.find((input) => input.key === key)).toMatchObject({
        defaultToAgentGenerated: true
      });
    });
    (
      [
        [ClassifyQuestionModule, NodeInputKeyEnum.aiSystemPrompt],
        [ClassifyQuestionModule, NodeInputKeyEnum.history],
        [ToolCallNode, NodeInputKeyEnum.aiSystemPrompt],
        [ToolCallNode, NodeInputKeyEnum.history]
      ] as const
    ).forEach(([template, key]) => {
      expect(template.inputs.find((input) => input.key === key)).not.toHaveProperty(
        'defaultToAgentGenerated'
      );
    });
    expect(
      CustomFeedbackNode.inputs.find((input) => input.key === NodeInputKeyEnum.textareaInput)
    ).toMatchObject({ defaultToAgentGenerated: false });
  });

  it('never defaults history or system prompt inputs to AI generation', () => {
    const developerConfiguredInputs = moduleTemplatesFlat.flatMap((template) =>
      template.inputs.filter((input) =>
        [NodeInputKeyEnum.history, NodeInputKeyEnum.aiSystemPrompt].includes(
          input.key as NodeInputKeyEnum
        )
      )
    );

    expect(developerConfiguredInputs.length).toBeGreaterThan(0);
    developerConfiguredInputs.forEach((input) => {
      expect(input.defaultToAgentGenerated).not.toBe(true);
      expect(normalizeFlowNodeInputType(input, { isTool: true }).selectedType).not.toBe(
        FlowNodeInputTypeEnum.agentGenerated
      );
    });
  });

  it('allows AI-generated mode for every requested tool input', () => {
    const requestedInputs = [
      ...ClassifyQuestionModule.inputs.filter((input) =>
        [
          NodeInputKeyEnum.aiSystemPrompt,
          NodeInputKeyEnum.history,
          NodeInputKeyEnum.userChatInput
        ].includes(input.key as NodeInputKeyEnum)
      ),
      ...ToolCallNode.inputs.filter((input) =>
        [
          NodeInputKeyEnum.aiSystemPrompt,
          NodeInputKeyEnum.history,
          NodeInputKeyEnum.fileUrlList,
          NodeInputKeyEnum.userChatInput
        ].includes(input.key as NodeInputKeyEnum)
      ),
      ...ReadFilesNode.inputs.filter((input) => input.key === NodeInputKeyEnum.fileUrlList),
      ...CustomFeedbackNode.inputs.filter((input) => input.key === NodeInputKeyEnum.textareaInput)
    ];

    requestedInputs.forEach((input) => {
      expect(normalizeFlowNodeInputType(input, { isTool: true }).renderTypeList).toContain(
        FlowNodeInputTypeEnum.agentGenerated
      );
    });

    expect(
      normalizeFlowNodeInputType(
        ClassifyQuestionModule.inputs.find(
          (input) => input.key === NodeInputKeyEnum.userChatInput
        )!,
        { isTool: true }
      ).selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
    // 取消默认 AI 生成的字段仍可切换为 AI 生成，但初始选中回落到手动输入
    (
      [
        [ClassifyQuestionModule, NodeInputKeyEnum.aiSystemPrompt],
        [ClassifyQuestionModule, NodeInputKeyEnum.history],
        [ToolCallNode, NodeInputKeyEnum.aiSystemPrompt],
        [ToolCallNode, NodeInputKeyEnum.history]
      ] as const
    ).forEach(([template, key]) => {
      const input = template.inputs.find((item) => item.key === key)!;
      expect(normalizeFlowNodeInputType(input, { isTool: true }).renderTypeList).toContain(
        FlowNodeInputTypeEnum.agentGenerated
      );
      expect(normalizeFlowNodeInputType(input, { isTool: true }).selectedType).not.toBe(
        FlowNodeInputTypeEnum.agentGenerated
      );
    });
    expect(
      normalizeFlowNodeInputType(
        ReadFilesNode.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)!,
        { isTool: true }
      ).selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(
      normalizeFlowNodeInputType(
        CustomFeedbackNode.inputs.find((input) => input.key === NodeInputKeyEnum.textareaInput)!,
        { isTool: true }
      ).selectedType
    ).not.toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(
      normalizeFlowNodeInputType(TextEditorNode.inputs[0], { isTool: true }).renderTypeList
    ).not.toContain(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('keeps code node custom variables separate from tool params', () => {
    expect(CodeNode.flowNodeType).toBe(FlowNodeTypeEnum.code);
    expect(CodeNode.hasToolInput).toBe(true);
    expect(HttpNode468.hasToolInput).toBe(true);
    expect(
      getInputComponentProps(
        CodeNode.inputs.find((input) => input.key === NodeInputKeyEnum.addInputParam)!
      )
    ).toMatchObject({ canAgentGenerated: false });
    expect(
      CodeNode.inputs.find((input) => input.key === NodeInputKeyEnum.addInputParam)
    ).not.toHaveProperty('defaultToAgentGenerated');
  });

  it('restores code input agent-generation policy from templates', () => {
    const result = storeNode2FlowNode({
      item: {
        nodeId: 'code-node',
        flowNodeType: FlowNodeTypeEnum.code,
        position: { x: 0, y: 0 },
        name: 'Code',
        inputs: [
          {
            key: 'data1',
            label: 'data1',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.agentGenerated],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            canAgentGenerated: true,
            value: ['source', 'output']
          },
          {
            key: 'data2',
            label: 'data2',
            renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.agentGenerated],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            canAgentGenerated: true,
            value: ['source', 'output']
          },
          {
            key: 'customParam',
            label: 'customParam',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            canAgentGenerated: true,
            defaultToAgentGenerated: true,
            value: 'generated'
          }
        ],
        outputs: []
      } as any,
      isTool: true,
      t: ((key: string) => key) as any
    });

    const inputs = result.data.inputs;
    const data1 = inputs.find((input) => input.key === 'data1');
    const data2 = inputs.find((input) => input.key === 'data2');
    const customParam = inputs.find((input) => input.key === 'customParam');

    expect(data1).toMatchObject({ canAgentGenerated: false });
    expect(data2).toMatchObject({ canAgentGenerated: false });
    expect(data1?.renderTypeList).not.toContain(FlowNodeInputTypeEnum.agentGenerated);
    expect(data2?.renderTypeList).not.toContain(FlowNodeInputTypeEnum.agentGenerated);
    expect(customParam).toMatchObject({
      canAgentGenerated: true,
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });
  });

  it('only exposes custom tool params for HTTP and Code nodes', () => {
    const createNode = (flowNodeType: FlowNodeTypeEnum, hasToolInput = true) =>
      ({ flowNodeType, hasToolInput }) as Parameters<typeof hasDynamicToolInput>[0];

    expect(hasDynamicToolInput(createNode(FlowNodeTypeEnum.pluginModule))).toBe(false);
    expect(hasDynamicToolInput(createNode(FlowNodeTypeEnum.httpRequest468))).toBe(true);
    expect(hasDynamicToolInput(createNode(FlowNodeTypeEnum.code))).toBe(true);
  });

  it('does not expose AI-generated mode for control and code nodes', () => {
    [IfElseNode, ParallelRunNode, LoopRunNode, CodeNode].forEach((template) => {
      template.inputs.forEach((input) => {
        expect(normalizeFlowNodeInputType(input, { isTool: true }).renderTypeList).not.toContain(
          FlowNodeInputTypeEnum.agentGenerated
        );
      });
    });
  });

  it('keeps every registered tool template canonical through frontend save serialization', () => {
    const toolNodes = moduleTemplatesFlat
      .filter((template) => template.isTool === true)
      .map((template, index) =>
        nodeTemplate2FlowNode({
          template,
          position: { x: index * 100, y: 0 },
          t: ((key: string) => key) as any
        })
      );
    const workflow = uiWorkflow2StoreWorkflow({ nodes: toolNodes, edges: [], chatConfig: {} });

    expect(CanonicalWorkflowDataSchema.safeParse({ ...workflow, chatConfig: {} }).success).toBe(
      true
    );
    expect(PublishAppBodySchema.safeParse({ ...workflow, chatConfig: {} }).success).toBe(true);
  });
});
