import type { ModuleItemType } from '../module/type.d';

export type CreateOneToolParams = {
  name: string;
  avatar: string;
  intro: string;
  modules?: ModuleItemType[];
};
export type UpdateOneToolParams = {
  id: string;
  name?: string;
  avatar?: string;
  intro?: string;
  modules?: ModuleItemType[];
};
export type ToolListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
};
