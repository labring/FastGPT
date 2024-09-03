import { SystemConfigNode } from './system/systemConfig';
import { PluginConfigNode } from './system/pluginConfig';
import { EmptyNode } from './system/emptyNode';
import { WorkflowStart } from './system/workflowStart';
import { AiChatModule } from './system/aiChat';
import { DatasetSearchModule } from './system/datasetSearch';
import { DatasetConcatModule } from './system/datasetConcat';
import { AssignedAnswerModule } from './system/assignedAnswer';
import { ClassifyQuestionModule } from './system/classifyQuestion/index';
import { ContextExtractModule } from './system/contextExtract/index';
import { HttpNode468 } from './system/http468';

import { ToolModule } from './system/tools';
import { StopToolNode } from './system/stopTool';

import { RunAppModule } from './system/abandoned/runApp/index';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { RunPluginModule } from './system/runPlugin';
import { RunAppNode } from './system/runApp';
import { AiQueryExtension } from './system/queryExtension';

import type { FlowNodeTemplateType } from '../type/node';
import { LafModule } from './system/laf';
import { IfElseNode } from './system/ifElse/index';
import { VariableUpdateNode } from './system/variableUpdate';
import { CodeNode } from './system/sandbox';
import { TextEditorNode } from './system/textEditor';
import { CustomFeedbackNode } from './system/customFeedback';
import { ReadFilesNodes } from './system/readFiles';
import { UserSelectNode } from './system/userSelect/index';

const systemNodes: FlowNodeTemplateType[] = [
  AiChatModule,
  TextEditorNode,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  ToolModule,
  StopToolNode,
  ClassifyQuestionModule,
  ContextExtractModule,
  ReadFilesNodes,
  HttpNode468,
  AiQueryExtension,
  LafModule,
  IfElseNode,
  VariableUpdateNode,
  CodeNode
];
/* app flow module templates */
export const appSystemModuleTemplates: FlowNodeTemplateType[] = [
  SystemConfigNode,
  WorkflowStart,
  ...systemNodes,
  CustomFeedbackNode,
  UserSelectNode
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
  RunAppModule
];
