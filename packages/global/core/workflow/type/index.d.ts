import { ParentIdType } from 'common/parentFolder/type';
import { AppTypeEnum } from 'core/app/constants';
import { AppChatConfigType } from '../../app/type';
import { StoreEdgeItemType } from './edge';
import { StoreNodeItemType } from './node';

export type localeType = 'en' | 'zh-CN' | 'zh-Hant';
export type I18nStringType =
  | {
      'zh-CN': string;
      'zh-Hant'?: string;
      en?: string;
    }
  | string;

export type WorkflowTemplateBasicType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};
export type WorkflowTemplateType = {
  id: string;
  parentId?: ParentIdType;
  isFolder?: boolean;

  name: I18nStringType;
  avatar: string;
  intro?: I18nStringType;
  author?: string;
  courseUrl?: string;
  version: string;

  showStatus?: boolean;
  weight?: number;

  workflow: WorkflowTemplateBasicType;
};

// template market
export type TemplateMarketItemType = WorkflowTemplateType & {
  tags: string[];
  type: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;
};
// template market list
export type TemplateMarketListItemType = {
  id: string;
  name: string;
  intro?: string;
  author?: string;
  tags: string[];
  type: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;
  avatar: string;
};

// system plugin
export type SystemPluginTemplateItemType = WorkflowTemplateType & {
  customWorkflow?: string;
  associatedPluginId?: string;
  userGuide?: string;

  templateType: string;
  isTool?: boolean;

  // commercial plugin config
  originCost: number; // n points/one time
  currentCost: number;
  hasTokenFee: boolean;
  pluginOrder: number;

  isActive?: boolean;
  isOfficial?: boolean;
  inputConfig?: {
    // Render config input form. Find the corresponding node and replace the variable directly
    key: string;
    label: string;
    description: string;
    value?: any;
  }[];
};

export type THelperLine = {
  position: number;
  nodes: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }[];
};
