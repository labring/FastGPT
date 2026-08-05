import { FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../../constants';
import { i18nT } from '../../../../../common/i18n/utils';
import { PluginStatusEnum } from '../../../../plugin/type';

/** @deprecated 系统配置已迁入 chatConfig，仅保留用于解析历史工作流。 */
export const SystemConfigNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.systemConfig,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.systemConfig,
  status: PluginStatusEnum.SoonOffline,
  showSourceHandle: false,
  showTargetHandle: false,
  avatar: 'core/workflow/template/systemConfig',
  avatarLinear: 'core/workflow/template/systemConfigLinear',
  colorSchema: 'pink',
  name: i18nT('workflow:template.system_config'),
  intro: '',
  unique: true,
  forbidDelete: true,
  inputs: [],
  outputs: []
};
