import { ModuleTemplateTypeEnum } from '../module/constants';
import { ModuleItemType } from '../module/type';

export const defaultModules: ModuleItemType[] = [
  {
    moduleId: 'custom-output',
    name: '自定义输出',
    flowType: 'pluginOutput',
    showStatus: false,
    position: {
      x: 994.1266684738011,
      y: -45.87689365278443
    },
    inputs: [],
    outputs: []
  },
  {
    moduleId: 'custom-input',
    name: '自定义输入',
    flowType: 'pluginInput',
    showStatus: false,
    position: {
      x: 457.57860319995154,
      y: -44.25099042468186
    },
    inputs: [],
    outputs: []
  }
];

export enum PluginTypeEnum {
  personal = 'personal',
  community = 'community',
  commercial = 'commercial'
}
export const PluginType2TemplateTypeMap = {
  [PluginTypeEnum.personal]: ModuleTemplateTypeEnum.personalPlugin,
  [PluginTypeEnum.community]: ModuleTemplateTypeEnum.communityPlugin,
  [PluginTypeEnum.commercial]: ModuleTemplateTypeEnum.commercialPlugin
};
