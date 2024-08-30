import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const PluginConfigNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginConfig,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginConfig,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: 'core/workflow/template/systemConfig',
  name: i18nT('workflow:template.system_config'),
  intro: '',
  unique: true,
  forbidDelete: true,
  version: '4811',
  inputs: [],
  outputs: []
};
