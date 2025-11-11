import { FlowNodeTypeEnum } from '../node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from '../constants';
import { DispatchNodeResponseKeyEnum } from '../runtime/constants';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from './io.d';
import { CustomInputItemType } from './io.d';
import {
  ChatHistoryItemResType,
  ChatItemType,
  ChatItemValueItemType,
  ToolRunResponseItemType
} from '../../chat/type';
import { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import type { StoreEdgeItemType } from './edge';
import type { AppChatConfigType } from '../../app/type';
import type { ParentIdType } from 'common/parentFolder/type';
import type { AppTypeEnum } from 'core/app/constants';
import type { StoreNodeItemType } from './node';
import { FlowNodeTemplateType } from './node';
import type { SecretValueType } from './../../../common/secret/type';
import type { I18nStringType } from '../../../common/i18n/type';

export type WorkflowTemplateBasicType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};
export type WorkflowTemplateType = {
  id: string;
  parentId?: ParentIdType;
  isFolder?: boolean;

  avatar?: string;
  name: I18nStringType | string;
  intro?: I18nStringType | string;
  toolDescription?: string;

  author?: string;
  courseUrl?: string;
  weight?: number;

  version?: string;
  workflow: WorkflowTemplateBasicType;
};

// template market
export type TemplateMarketItemType = WorkflowTemplateType & {
  tags: string[];
  type: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.workflowTool;
};
// template market list
export type TemplateMarketListItemType = {
  id: string;
  name: string;
  intro?: string;
  author?: string;
  tags: string[];
  type: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.workflowTool;
  avatar: string;
};
