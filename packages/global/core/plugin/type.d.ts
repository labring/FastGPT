import { ModuleTemplateTypeEnum } from 'core/module/constants';
import type { ModuleItemType } from '../module/type.d';
import { PluginTypeEnum } from './constants';

export type PluginItemSchema = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  name: string;
  avatar: string;
  intro: string;
  updateTime: Date;
  modules: ModuleItemType[];
};

/* plugin template */
export type PluginTemplateType = {
  id: string;
  type: `${PluginTypeEnum}`;
  name: string;
  avatar: string;
  intro: string;
  modules: ModuleItemType[];
  templateType?: `${ModuleTemplateTypeEnum}`;
};
