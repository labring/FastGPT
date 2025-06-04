import { defineTool } from '@/type';

export default defineTool({
  toolId: 'community-DingTalkWebhook',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'communication',
  name: {
    'zh-CN': '钉钉 webhook',
    en: 'DingTalk Webhook'
  },
  description: {
    'zh-CN': '向钉钉机器人发起 webhook 请求。',
    en: 'Send a webhook request to DingTalk.'
  },
  icon: 'plugins/dingding',
  docURL: 'https://open.dingtalk.com/document/robots/custom-robot-access',
  inputs: [
    {
      valueType: 'string',
      key: '钉钉机器人地址',
      label: '钉钉机器人地址',
      description: '',
      defaultValue: '',
      renderTypeList: ['input', 'reference'],
      required: true,
      value: ''
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: '加签值',
      label: '加签值',
      description: '钉钉机器人加签值',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      maxFiles: 5,
      canSelectFile: true,
      canSelectImg: true,
      required: true
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: '发送的消息',
      label: '发送的消息',
      description: '发送的消息',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      maxFiles: 5,
      canSelectFile: true,
      canSelectImg: true,
      required: true,
      toolDescription: '发送的消息'
    }
  ],
  outputs: [
    {
      id: 'mv52BrPVE6bm',
      key: '钉钉机器人地址',
      valueType: 'string',
      label: '钉钉机器人地址',
      type: 'static'
    },
    {
      id: 'srcret',
      valueType: 'string',
      key: '加签值',
      label: '加签值',
      type: 'hidden'
    },
    {
      id: '发送的消息',
      valueType: 'string',
      key: '发送的消息',
      label: '发送的消息',
      type: 'hidden'
    }
  ]
});
