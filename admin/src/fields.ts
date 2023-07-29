import { createTextField, createNumberField } from 'tushan';

export const userFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('username', { label: '用户名' }),
  createNumberField('balance', { label: '余额（元）', list: { sort: true } }),
  createTextField('createTime', {
    label: '创建时间',
    list: { sort: true },
    edit: { hidden: true }
  }),
  createTextField('password', { label: '密码', list: { hidden: true } })
];

export const payFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('userId', { label: '用户Id' }),
  createNumberField('price', { label: '支付金额' }),
  createTextField('orderId', { label: 'orderId' }),
  createTextField('status', { label: '状态' }),
  createTextField('createTime', { label: '创建时间', list: { sort: true } })
];

export const kbFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('userId', { label: '所属用户', edit: { hidden: true } }),
  createTextField('name', { label: '知识库' }),
  createTextField('tags', { label: 'Tags' })
];

export const AppFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('userId', { label: '所属用户', list: { hidden: true }, edit: { hidden: true } }),
  createTextField('name', { label: '名字' }),
  createTextField('app', { label: '应用', edit: { hidden: true } }),
  createTextField('share.collection', { label: '收藏数', list: { sort: true } }),
  createTextField('share.topNum', { label: '置顶等级', list: { sort: true } }),
  createTextField('share.isShare', { label: '是否分享(true,false)' }),
  createTextField('intro', { label: '介绍', list: { width: 400 } }),
  createTextField('temperature', { label: '温度' }),
  createTextField('systemPrompt', {
    label: '提示词',
    list: {
      width: 400,
      hidden: true
    }
  })
];
