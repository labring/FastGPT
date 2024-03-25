import { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import { ChatItemValueItemType, ToolRunResponseItemType } from '../../chat/type';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from '../node/type';
import { ModuleItemType } from '../type';
import { DispatchNodeResponseKeyEnum } from './constants';

export type RunningModuleItemType = {
  name: ModuleItemType['name'];
  avatar: ModuleItemType['avatar'];
  intro?: ModuleItemType['intro'];
  moduleId: ModuleItemType['moduleId'];
  flowType: ModuleItemType['flowType'];
  showStatus?: ModuleItemType['showStatus'];
  isEntry?: ModuleItemType['isEntry'];

  inputs: {
    key: string;
    value?: any;
    valueType?: FlowNodeInputItemType['valueType'];
    required?: boolean;
    toolDescription?: string;
  }[];
  outputs: {
    key: string;
    required?: boolean;
    defaultValue?: any;
    answer?: boolean;
    response?: boolean;
    value?: any;
    valueType?: FlowNodeOutputItemType['valueType'];
    targets: {
      moduleId: string;
      key: string;
    }[];
  }[];
};

export type DispatchNodeResponseType = {
  // common
  moduleLogo?: string;
  runningTime?: number;
  query?: string;
  textOutput?: string;

  // bill
  tokens?: number;
  model?: string;
  contextTotalLen?: number;
  totalPoints?: number;

  // chat
  temperature?: number;
  maxToken?: number;
  quoteList?: SearchDataResponseItemType[];
  historyPreview?: {
    obj: `${ChatRoleEnum}`;
    value: string;
  }[]; // completion context array. history will slice

  // dataset search
  similarity?: number;
  limit?: number;
  searchMode?: `${DatasetSearchModeEnum}`;
  searchUsingReRank?: boolean;
  extensionModel?: string;
  extensionResult?: string;
  extensionTokens?: number;

  // cq
  cqList?: ClassifyQuestionAgentItemType[];
  cqResult?: string;

  // content extract
  extractDescription?: string;
  extractResult?: Record<string, any>;

  // http
  params?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, any>;
  httpResult?: Record<string, any>;

  // plugin output
  pluginOutput?: Record<string, any>;
  pluginDetail?: ChatHistoryItemResType[];

  // tf switch
  tfSwitchResult?: boolean;

  // tool
  toolCallTokens?: number;
  toolDetail?: ChatHistoryItemResType[];
  toolStop?: boolean;
};

export type DispatchNodeResultType<T> = {
  [DispatchNodeResponseKeyEnum.nodeResponse]?: DispatchNodeResponseType; // The node response detail
  [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[]; //
  [DispatchNodeResponseKeyEnum.childrenResponses]?: DispatchNodeResultType[];
  [DispatchNodeResponseKeyEnum.toolResponses]?: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]?: ChatItemValueItemType[];
} & T;
