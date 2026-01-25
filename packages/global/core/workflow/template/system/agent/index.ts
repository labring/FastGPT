import { FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../../constants';
import {
  Input_Template_History,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../../input';
import { i18nT } from '../../../../../../web/i18n/utils';
import { DatasetSearchModeEnum } from '../../../../dataset/constants';

export const AgentNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.agent,
  flowNodeType: FlowNodeTypeEnum.agent,
  templateType: FlowNodeTemplateTypeEnum.ai,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/app/type/agentFill',
  name: 'Agent',
  intro: '',
  showStatus: true,
  isTool: true,
  version: '4.16.0',
  catchError: false,
  inputs: [],
  outputs: []
};
