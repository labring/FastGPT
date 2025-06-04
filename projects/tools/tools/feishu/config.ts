import { defineTool, FlowNodeOutputTypeEnum, WorkflowIOValueTypeEnum } from '@/type';

export default defineTool({
  toolId: 'community-feishu',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'communication',
  name: {
    'zh-CN': '飞书 webhook',
    en: 'Feishu Webhook'
  },
  description: {
    'zh-CN': '向飞书机器人发起 webhook 请求。',
    en: 'Send webhook request to Feishu bot.'
  },
  icon: 'core/app/templates/plugin-feishu',
  inputs: [
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'content',
      label: 'content',
      description: '需要发送的消息',
      required: true,
      toolDescription: '需要发送的消息',
      defaultValue: ''
    },
    {
      renderTypeList: ['input'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'hook_url',
      label: 'hook_url',
      description: '飞书机器人地址',
      required: true,
      defaultValue: ''
    }
  ],
  outputs: [
    {
      id: 'result',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'result',
      label: 'Http Response'
    }
  ]
});
