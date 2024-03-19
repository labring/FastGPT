import type { ModuleItemType } from '../module/type.d';
import { PluginTypeEnum } from './constants';
import { HttpAuthMethodType } from './httpPlugin/type';

export type CreateOnePluginParams = {
  name: string;
  avatar: string;
  intro: string;
  modules: ModuleItemType[];
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
  modules?: ModuleItemType[];
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
