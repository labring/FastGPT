import { defineTool, FlowNodeInputTypeEnum, WorkflowIOValueTypeEnum } from '@/type';

export default defineTool({
  toolId: 'community-delay',
  versionList: [
    {
      version: '1.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': '流程等待',
    en: 'Delay'
  },
  description: {
    'zh-CN': '让工作流等待指定时间后运行',
    en: 'Delay the workflow after a specified time'
  },
  icon: 'core/workflow/template/sleep',
  inputs: [
    {
      key: 'ms',
      label: '延迟时长',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.number,
      toolDescription: '要暂停的时间，单位毫秒'
    }
  ],
  outputs: []
});
