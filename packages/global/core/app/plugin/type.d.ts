import type { StoreEdgeItemType } from 'core/workflow/type/edge';
import { ModuleTemplateTypeEnum } from '../../workflow/constants';
import type { StoreNodeItemType } from '../../workflow/type/node';
import { MethodType } from './controller';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import type { WorkflowTemplateType } from '../../workflow/type';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../workflow/type/io';
import type { ParentIdType } from 'common/parentFolder/type';

export type PluginRuntimeType = {
  id: string;
  teamId?: string;
  tmbId?: string;

  name: string;
  avatar: string;
  showStatus?: boolean;
  isTool?: boolean;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  currentCost?: number;
  systemKeyCost?: number;
  hasTokenFee?: boolean;
};

// system plugin
export type SystemPluginTemplateItemType = WorkflowTemplateType & {
  parentId?: ParentIdType;
  isFolder?: boolean;
  templateType: string;

  // FastGPT-plugin tool
  inputs?: FlowNodeInputItemType[];
  outputs?: FlowNodeOutputItemType[];
  versionList?: {
    value: string;
    description?: string;

    inputs: FlowNodeInputItemType[];
    outputs: FlowNodeOutputItemType[];
  }[];

  // Admin workflow tool
  associatedPluginId?: string;
  userGuide?: string;

  // commercial plugin config
  originCost?: number; // n points/one time
  currentCost?: number;
  hasTokenFee?: boolean;
  pluginOrder?: number;
  systemKeyCost?: number;

  isActive?: boolean;
  isOfficial?: boolean;

  // Admin config
  inputList?: FlowNodeInputItemType['inputList'];
  inputListVal?: {
    _id: false;
    key: string;
    label: string;
    description: string;
    inputType: string;
    required: boolean;
    value: string;
    list: { label: string; value: string }[];
  }[];
  hasSystemSecret?: boolean;
};

export type SystemPluginTemplateListItemType = Omit<
  SystemPluginTemplateItemType,
  'name' | 'intro'
> & {
  name: string;
  intro: string;
};
