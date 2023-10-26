export type CreateOneModuleParams = {
  name: string;
  avatar: string;
  intro: string;
  modules?: ModuleItemType[];
};
export type UpdateNoduleParams = {
  id: string;
  name?: string;
  avatar?: string;
  intro?: string;
  modules?: ModuleItemType[];
};
export type ModuleListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
};
