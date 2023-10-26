import type { ModuleItemType } from '../module/type.d';

export type CreateOnePluginParams = {
  name: string;
  avatar: string;
  intro: string;
  modules?: ModuleItemType[];
};
export type UpdatePluginParams = {
  id: string;
  name?: string;
  avatar?: string;
  intro?: string;
  modules?: ModuleItemType[];
};
export type PluginListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
};
