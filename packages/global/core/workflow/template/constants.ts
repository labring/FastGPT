import { SystemConfigNode } from './system/systemConfig';
import { EmptyNode } from './system/emptyNode';
import { WorkflowStart } from './system/workflowStart';
import { AiChatModule } from './system/aiChat';
import { DatasetSearchModule } from './system/datasetSearch';
import { DatasetConcatModule } from './system/datasetConcat';
import { AssignedAnswerModule } from './system/assignedAnswer';
import { ClassifyQuestionModule } from './system/classifyQuestion';
import { ContextExtractModule } from './system/contextExtract';
import { HttpModule468 } from './system/http468';

import { ToolModule } from './system/tools';
import { StopToolNode } from './system/stopTool';

import { RunAppModule } from './system/runApp';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { RunPluginModule } from './system/runPlugin';
import { AiQueryExtension } from './system/queryExtension';

import type { FlowNodeTemplateType } from '../type';
import { LafModule } from './system/laf';
import { IfElseNode } from './system/ifElse/index';
import { VariableUpdateNode } from './system/variableUpdate';
import { CodeNode } from './system/sandbox';

/* app flow module templates */
export const appSystemModuleTemplates: FlowNodeTemplateType[] = [
  SystemConfigNode,
  WorkflowStart,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  RunAppModule,
  ToolModule,
  StopToolNode,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  AiQueryExtension,
  LafModule,
  IfElseNode,
  VariableUpdateNode,
  CodeNode
];
/* plugin flow module templates */
export const pluginSystemModuleTemplates: FlowNodeTemplateType[] = [
  PluginInputModule,
  PluginOutputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  RunAppModule,
  ToolModule,
  StopToolNode,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  AiQueryExtension,
  LafModule,
  IfElseNode,
  VariableUpdateNode,
  CodeNode
];

/* all module */
export const moduleTemplatesFlat: FlowNodeTemplateType[] = [
  EmptyNode,
  SystemConfigNode,
  WorkflowStart,
  AiChatModule,
  DatasetSearchModule,
  DatasetConcatModule,
  AssignedAnswerModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  ToolModule,
  StopToolNode,
  AiChatModule,
  RunAppModule,
  PluginInputModule,
  PluginOutputModule,
  RunPluginModule,
  AiQueryExtension,
  LafModule,
  IfElseNode,
  VariableUpdateNode,
  CodeNode
];
