import { ModuleTemplateTypeEnum } from 'core/module/constants';
import type { FlowModuleTemplateType, ModuleItemType } from '../module/type.d';
import { PluginSourceEnum } from './constants';

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
export type PluginTemplateType = PluginRuntimeType & {
  author?: string;
  id: string;
  source: `${PluginSourceEnum}`;
  templateType: FlowModuleTemplateType['templateType'];
  intro: string;
  modules: ModuleItemType[];
};

export type PluginRuntimeType = {
  teamId?: string;
  name: string;
  avatar: string;
  showStatus?: boolean;
  modules: ModuleItemType[];
};
