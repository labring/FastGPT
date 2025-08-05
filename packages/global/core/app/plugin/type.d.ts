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
  hasTokenFee?: boolean;
};

// system plugin
export type SystemPluginTemplateItemType = WorkflowTemplateType & {
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

  isActive?: boolean;
  isOfficial?: boolean;

  // Admin config
  inputList?: FlowNodeInputItemType['inputList'];
  hasSystemSecret?: boolean;
};

export type SystemPluginTemplateListItemType = Omit<
  SystemPluginTemplateItemType,
  'name' | 'intro'
> & {
  name: string;
  intro: string;
};
