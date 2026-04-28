import type { StoreEdgeItemType } from '../../workflow/type/edge';
import type { StoreNodeItemType } from '../../workflow/type/node';
import type { WorkflowTemplateType } from '../../workflow/type';
import {
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema,
  InputConfigTypeSchema,
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '../../workflow/type/io';
import {
  PluginStatusSchema,
  type PluginStatusType,
  type SystemPluginToolTagType
} from '../../plugin/type';
import type { UserTagsType } from '../../../support/user/type';
import { UserTagsSchema } from '../../../support/user/type';
import z from 'zod';

export type AppToolRuntimeType = {
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

// // System tool
// export type AppToolTemplateItemType = WorkflowTemplateType & {
//   status?: PluginStatusType;
//   // FastGPT-plugin tool
//   inputs?: FlowNodeInputItemType[];
//   outputs?: FlowNodeOutputItemType[];

//   // Admin workflow tool
//   associatedPluginId?: string;
//   userGuide?: string;
//   readmeUrl?: string;

//   // commercial plugin config
//   originCost?: number; // n points/one time
//   currentCost?: number;
//   systemKeyCost?: number;
//   hasTokenFee?: boolean;
//   pluginOrder?: number;

//   tags?: string[] | null;
//   isOfficial?: boolean;

//   // Admin config
//   inputList?: FlowNodeInputItemType['inputList'];
//   inputListVal?: Record<string, any>;
//   hasSystemSecret?: boolean;

//   // User tag filtering
//   hideTags?: UserTagsType[] | null;
//   promoteTags?: UserTagsType[] | null;

//   /** @deprecated */
//   isActive?: boolean; //use tags instead
//   /** @deprecated */
//   templateType?: string;
// };

// export type AppToolTemplateListItemType = Omit<
//   AppToolTemplateItemType,
//   'name' | 'intro' | 'workflow'
// > & {
//   name: string;
//   intro: string;
//   tags?: SystemPluginToolTagType[];
// };
