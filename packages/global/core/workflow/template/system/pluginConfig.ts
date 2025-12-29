import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node.d';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';

export const PluginConfigNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginConfig,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginConfig,
  showSourceHandle: false,
  showTargetHandle: false,
  avatar: 'core/workflow/systemNode/systemConfig',
  avatarLinear: 'core/workflow/systemNode/systemConfigLinear',
  colorSchema: 'pink',
  name: i18nT('workflow:template.system_config'),
  intro: '',
  unique: true,
  forbidDelete: true,
  inputs: [],
  outputs: []
};
