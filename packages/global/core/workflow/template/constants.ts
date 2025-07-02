import { AiChatModule } from './system/aiChat';
import { AssignedAnswerModule } from './system/assignedAnswer';
import { ClassifyQuestionModule } from './system/classifyQuestion/index';
import { ContextExtractModule } from './system/contextExtract/index';
import { DatasetConcatModule } from './system/datasetConcat';
import { DatasetSearchModule } from './system/datasetSearch';
import { EmptyNode } from './system/emptyNode';
import { HttpNode468 } from './system/http468';
import { PluginConfigNode } from './system/pluginConfig';
import { SystemConfigNode } from './system/systemConfig';
import { WorkflowStart } from './system/workflowStart';

import { StopToolNode } from './system/stopTool';
import { AgentNode } from './system/agent';

import { RunAppModule } from './system/abandoned/runApp/index';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { AiQueryExtension } from './system/queryExtension';
import { RunAppNode } from './system/runApp';
import { RunPluginModule } from './system/runPlugin';

import type { FlowNodeTemplateType } from '../type/node';
import { CustomFeedbackNode } from './system/customFeedback';
import { IfElseNode } from './system/ifElse/index';
import { FormInputNode } from './system/interactive/formInput';
import { UserSelectNode } from './system/interactive/userSelect';
import { LafModule } from './system/laf';
import { LoopNode } from './system/loop/loop';
import { LoopEndNode } from './system/loop/loopEnd';
import { LoopStartNode } from './system/loop/loopStart';
import { ReadFilesNode } from './system/readFiles';
import { RunToolNode } from './system/runTool';
import { RunToolSetNode } from './system/runToolSet';
import { CodeNode } from './system/sandbox';
import { TextEditorNode } from './system/textEditor';
import { ToolParamsNode } from './system/toolParams';
import { VariableUpdateNode } from './system/variableUpdate';

const systemNodes: FlowNodeTemplateType[] = [
  AiChatModule,
  TextEditorNode,
  AssignedAnswerModule,
  DatasetSearchModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  DatasetConcatModule,
  AgentNode,
  ToolParamsNode,
  StopToolNode,
  ReadFilesNode,
  HttpNode468,
  AiQueryExtension,
  LafModule,
  IfElseNode,
  VariableUpdateNode,
  CodeNode,
  LoopNode
];
/* app flow module templates */
export const appSystemModuleTemplates: FlowNodeTemplateType[] = [
  SystemConfigNode,
  WorkflowStart,
  ...systemNodes,
  CustomFeedbackNode,
  UserSelectNode,
  FormInputNode
];
/* plugin flow module templates */
export const pluginSystemModuleTemplates: FlowNodeTemplateType[] = [
  PluginConfigNode,
  PluginInputModule,
  PluginOutputModule,
  ...systemNodes
];

/* all module */
export const moduleTemplatesFlat: FlowNodeTemplateType[] = [
  ...appSystemModuleTemplates.concat(
    pluginSystemModuleTemplates.filter(
      (item) => !appSystemModuleTemplates.find((app) => app.id === item.id)
    )
  ),
  EmptyNode,
  RunPluginModule,
  RunAppNode,
  RunAppModule,
  LoopStartNode,
  LoopEndNode,
  RunToolNode,
  RunToolSetNode
];
