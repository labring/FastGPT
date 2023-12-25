import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';
import { XYPosition } from 'reactflow';
import { AppModuleItemTypeEnum, ModulesInputItemTypeEnum } from '../constants/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  FlowNodeOutputTargetItemType
} from '@fastgpt/global/core/module/node/type.d';
import type { FlowModuleTemplateType, ModuleItemType } from '@fastgpt/global/core/module/type.d';
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
  modules: ModuleItemType[];
};

export type AppLogsListItemType = {
  _id: string;
  id: string;
  source: ChatSchema['source'];
  time: Date;
  title: string;
  messageCount: number;
  userGoodFeedbackCount: number;
  userBadFeedbackCount: number;
  customFeedbacksCount: number;
  markCount: number;
};
