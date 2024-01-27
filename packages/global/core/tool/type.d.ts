import { ModuleTemplateTypeEnum } from 'core/module/constants';
import type { FlowModuleTemplateType, ModuleItemType } from '../module/type.d';
import { ToolSourceEnum } from './constants';

export type ToolItemSchema = {
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
export type ToolTemplateType = ToolRuntimeItemType & {
  author?: string;
  id: string;
  source: `${ToolSourceEnum}`;
  templateType: FlowModuleTemplateType['templateType'];
  intro: string;
  modules: ModuleItemType[];
};

export type ToolRuntimeItemType = {
  teamId?: string;
  name: string;
  avatar: string;
  showStatus?: boolean;
  modules: ModuleItemType[];
};
