import { ModuleTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';

export const EmptyModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.empty,
  templateType: ModuleTemplateTypeEnum.other,
  flowType: FlowNodeTypeEnum.empty,
  avatar: '/imgs/module/cq.png',
  name: '该模块已被移除',
  intro: '',
  inputs: [],
  outputs: []
};
