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
    expect(
      ClassifyQuestionModule.inputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)
    ).toMatchObject({ defaultToAgentGenerated: true });
    expect(
      ReadFilesNode.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)
    ).toMatchObject({ defaultToAgentGenerated: true });
    expect(
      ToolCallNode.inputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)
    ).toMatchObject({ defaultToAgentGenerated: true });
    expect(
      CustomFeedbackNode.inputs.find((input) => input.key === NodeInputKeyEnum.textareaInput)
    ).toMatchObject({ defaultToAgentGenerated: false });
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
      CodeNode.inputs.find((input) => input.key === NodeInputKeyEnum.addInputParam)
    ).not.toHaveProperty('defaultToAgentGenerated');
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
});
