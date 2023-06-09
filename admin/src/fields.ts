import {
  createTextField,
  createUrlField,
  createNumberField,
  createAvatarField
} from 'tushan';

export const userFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('username', { label: '用户名', list: { sort: true } }),
  createTextField('password', { label: '密码（加密）' }),
  createNumberField('balance', { label: '余额' }),
  createTextField('openaiKey', { label: 'OpenAI Key' }),
  createTextField('createTime', { label: 'Create Time' }),
  createAvatarField('avatar', { label: 'Avatar' }),
];

export const payFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('name', { label: '用户名', list: { sort: true } }),
  createNumberField('price', { label: '支付金额' }),
  createTextField('orderId', { label: 'orderId' }),
  createTextField('status', { label: '状态' }),
  createTextField('createTime', { label: 'Create Time' }),
];

export const kbFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('user', { label: '所属用户' }),
  createTextField('name', { label: '知识库', list: { sort: true } }),
  createTextField('tags', { label: 'Tags' }),
  createAvatarField('avatar', { label: 'Avatar' }),
];

export const ModelFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('name', { label: 'Ai助手', list: { sort: true } }),
  createTextField('user', { label: '所属用户' }),
  createTextField('relatedKbs', { label: '引用的知识库' }),
  createTextField('searchMode', { label: '搜索模式' }),
  createTextField('systemPrompt', { label: '提示词' }),
  createTextField('temperature', { label: '温度' }),
  createTextField('isShare', { label: '是否分享' }),
  createTextField('isShareDetail', { label: '分享详情' }),
  createAvatarField('avatar', { label: 'Avatar' }),
];