import type { ModuleItemType } from '../module/type.d';

export type CreateOnePluginParams = {
  name: string;
  avatar: string;
  intro: string;
  modules?: ModuleItemType[];
  parentId: string | null;
  type: string;
  schema?: string | null;
  authMethod?: MethodType | null;
};
export type UpdatePluginParams = {
  id: string;
  name?: string;
  avatar?: string;
  intro?: string;
  modules?: ModuleItemType[];
};
export type PluginListItemType = {
  parentId: string;
  type: string;
  _id: string;
  name: string;
  avatar: string;
  intro: string;
  schema: string;
  authMethod: MethodType | null;
};
export type MethodType = {
  name: string;
  prefix: string;
  key: string;
  value: string;
};
