import {
  defineTool,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  WorkflowIOValueTypeEnum
} from '@/type';

export default defineTool({
  toolId: 'community-WeWorkWebhook',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'communication',
  name: {
    'zh-CN': '企业微信 webhook',
    en: 'WeWork Webhook'
  },
  description: {
    'zh-CN': '向企业微信机器人发起 webhook 请求。只能内部群使用。',
    en: 'Send webhook requests to WeWork robots. Only internal groups can use this tool.'
  },
  docURL: 'https://developer.work.weixin.qq.com/document/path/91770',
  icon: 'plugins/qiwei',
  inputs: [
    {
      key: '企微机器人地址',
      label: '企微机器人地址',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    },
    {
      key: '发送的消息',
      label: '发送的消息',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    }
  ],
  outputs: []
});
