import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { AssignedAnswerModule } from '@fastgpt/global/core/workflow/template/system/assignedAnswer';
import { TextEditorNode } from '@fastgpt/global/core/workflow/template/system/textEditor';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { AiQueryExtension } from '@fastgpt/global/core/workflow/template/system/queryExtension';
import { ContextExtractModule } from '@fastgpt/global/core/workflow/template/system/contextExtract';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { CodeNode } from '@fastgpt/global/core/workflow/template/system/sandbox';
import { RunAppModule } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp';
import { IfElseNode } from '@fastgpt/global/core/workflow/template/system/ifElse';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion';
import { UserSelectNode } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { ReadFilesNode } from '@fastgpt/global/core/workflow/template/system/readFiles';
import { VariableUpdateNode } from '@fastgpt/global/core/workflow/template/system/variableUpdate';
import { ParallelRunNode } from '@fastgpt/global/core/workflow/template/system/parallelRun/parallelRun';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunBreakNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import { LoopRunStartNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunStart';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { LoopEndNode } from '@fastgpt/global/core/workflow/template/system/loop/loopEnd';
import { DatasetConcatModule } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { CustomFeedbackNode } from '@fastgpt/global/core/workflow/template/system/customFeedback';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { WorkflowCommandError } from '../domain/diagnostic';
import { getAutomationMeta } from './automationMeta';
import { formatNodeTemplateRef, type NodeTemplateRef, type WorkflowTemplateProvider } from './type';

const builtinTemplates: Record<string, FlowNodeTemplateType> = {
  'builtin:workflow-start': WorkflowStart,
  'builtin:ai-chat': AiChatModule,
  'builtin:text-editor': TextEditorNode,
  'builtin:assigned-answer': AssignedAnswerModule,
  'builtin:dataset-search': DatasetSearchModule,
  'builtin:question-optimization': AiQueryExtension,
  'builtin:content-extract': ContextExtractModule,
  'builtin:http-request': HttpNode468,
  'builtin:code': CodeNode,
  'builtin:call-app': RunAppModule,
  'builtin:if-else': IfElseNode,
  'builtin:question-classification': ClassifyQuestionModule,
  'builtin:user-select': UserSelectNode,
  'builtin:form-input': FormInputNode,
  'builtin:tool-call': ToolCallNode,
  'builtin:read-files': ReadFilesNode,
  'builtin:variable-update': VariableUpdateNode,
  'builtin:parallel-run': ParallelRunNode,
  'builtin:loop-run': LoopRunNode,
  'builtin:loop-run-break': LoopRunBreakNode,
  'builtin:dataset-concat': DatasetConcatModule,
  'builtin:custom-feedback': CustomFeedbackNode,
  // 仅供容器命令自动实例化，不在 template list 中暴露。
  'builtin:__nested-start': LoopStartNode,
  'builtin:__nested-end': LoopEndNode,
  'builtin:__loop-run-start': LoopRunStartNode
};

export const builtinTemplateRefs: NodeTemplateRef[] = Object.keys(builtinTemplates)
  .filter((value) => !value.startsWith('builtin:__'))
  .map((value) => ({
    kind: 'builtin',
    templateId: value.slice('builtin:'.length)
  }));

export const builtinTemplateProvider: WorkflowTemplateProvider = {
  async list() {
    return [...builtinTemplateRefs];
  },
  async resolve(ref) {
    const template =
      ref.kind === 'builtin' ? builtinTemplates[formatNodeTemplateRef(ref)] : undefined;
    if (!template) {
      throw new WorkflowCommandError([
        {
          code: 'WORKFLOW_TEMPLATE_NOT_FOUND',
          severity: 'error',
          params: { template: formatNodeTemplateRef(ref) }
        }
      ]);
    }
    return {
      // invalidCondition 等函数只参与 Web 展示计算，本来就不会进入 Store JSON。
      template: JSON.parse(JSON.stringify(template)) as FlowNodeTemplateType,
      automationMeta: getAutomationMeta(ref)
    };
  }
};
