import { StoreEdgeItemType } from 'core/workflow/type/edge';
import type { StoreNodeItemType } from '../workflow/type/node';
import { PluginTypeEnum } from './constants';
import { HttpAuthMethodType } from '../app/httpPlugin/type';

export type CreateOnePluginParams = {
  name: string;
  avatar: string;
  intro: string;
  modules: StoreNodeItemType[];
  parentId: string | null;
  type: `${PluginTypeEnum}`;
  metadata?: {
    apiSchemaStr?: string;
    customHeaders?: string;
  };
};
export type UpdatePluginParams = {
  id: string;
  parentId?: string | null;
  name?: string;
  avatar?: string;
  intro?: string;
  modules?: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  metadata?: {
    apiSchemaStr?: string;
    customHeaders?: string;
  };
};
export type PluginListItemType = {
  _id: string;
  parentId: string;
  type: `${PluginTypeEnum}`;
  name: string;
  avatar: string;
  intro: string;
  metadata?: {
    apiSchemaStr?: string;
    customHeaders?: string;
  };
};
