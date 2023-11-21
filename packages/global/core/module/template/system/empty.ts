import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';

export const EmptyModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.empty,
  flowType: FlowNodeTypeEnum.empty,
  logo: '/imgs/module/cq.png',
  name: '该模块已被移除',
  intro: '',
  description: '',
  inputs: [],
  outputs: []
};
