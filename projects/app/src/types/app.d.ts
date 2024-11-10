import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { XYPosition } from 'reactflow';
import { AppModuleItemTypeEnum, ModulesInputItemTypeEnum } from '../constants/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { FlowNodeOutputTargetItemType } from '@fastgpt/global/core/workflow/node/type.d';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io.d';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { ChatSchema } from '@fastgpt/global/core/chat/type';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { ChatModelType } from '@/constants/model';

export interface ShareAppItem {
  _id: string;
  avatar: string;
  name: string;
  intro: string;
  userId: string;
  share: AppSchema['share'];
  isCollection: boolean;
}

/* app module */
export type AppItemType = {
  id: string;
  name: string;
  modules: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};

export type AppLogsListItemType = {
  _id: string;
  id: string;
  source: string;
  time: Date;
  title: string;
  messageCount: number;
  userGoodFeedbackCount: number;
  userBadFeedbackCount: number;
  customFeedbacksCount: number;
  markCount: number;
  outLinkUid?: string;
  tmbId: string;
};
