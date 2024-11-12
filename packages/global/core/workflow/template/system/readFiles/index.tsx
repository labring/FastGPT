import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import { getHandleConfig } from '../../utils';

export const ReadFilesNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.readFiles,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.readFiles,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/readFiles',
  name: i18nT('app:workflow.read_files'),
  intro: i18nT('app:workflow.read_files_tip'),
  showStatus: true,
  version: '4812',
  isTool: false,
  courseUrl: '/docs/guide/course/fileinput/',
  inputs: [
    {
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: i18nT('app:workflow.file_url'),
      required: true,
      value: []
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: i18nT('app:workflow.read_files_result'),
      description: i18nT('app:workflow.read_files_result_desc'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
