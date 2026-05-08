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

// export type AppToolTemplateListItemType = Omit<
//   AppToolTemplateItemType,
//   'name' | 'intro' | 'workflow'
// > & {
//   name: string;
//   intro: string;
//   tags?: SystemPluginToolTagType[];
// };
