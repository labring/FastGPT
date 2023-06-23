import { createTextField, createNumberField } from 'tushan';

export const userFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('username', { label: '用户名', edit: { hidden: true } }),
  createNumberField('balance', { label: '余额', list: { sort: true } }),
  createTextField('createTime', { label: 'Create Time', list: { sort: true } }),
  createTextField('password', { label: '密码', list: { hidden: true } })
];

export const payFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('userId', { label: '用户Id' }),
  createNumberField('price', { label: '支付金额' }),
  createTextField('orderId', { label: 'orderId' }),
  createTextField('status', { label: '状态' }),
  createTextField('createTime', { label: 'Create Time', list: { sort: true } })
];

export const kbFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('userId', { label: '所属用户', edit: { hidden: true } }),
  createTextField('name', { label: '知识库' }),
  createTextField('tags', { label: 'Tags' })
];

export const ModelFields = [
  createTextField('id', { label: 'ID' }),
  createTextField('userId', { label: '所属用户', list: { hidden: true }, edit: { hidden: true } }),
  createTextField('name', { label: '名字' }),
  createTextField('model', { label: '模型', edit: { hidden: true } }),
  createTextField('share.collection', { label: '收藏数', list: { sort: true } }),
  createTextField('share.topNum', { label: '置顶等级', list: { sort: true } }),
  createTextField('share.isShare', { label: '是否分享(true,false)' }),
  createTextField('intro', { label: '介绍', list: { width: 400 } }),
  createTextField('relatedKbs', { label: '引用的知识库', list: { hidden: true } }),
  createTextField('temperature', { label: '温度' }),
  createTextField('systemPrompt', {
    label: '提示词',
    list: {
      width: 400,
      hidden: true
    }
  })
];

export const SystemFields = [
  createTextField('vectorMaxProcess', { label: '向量最大进程' }),
  createTextField('qaMaxProcess', { label: 'qa最大进程' }),
  createTextField('pgIvfflatProbe', { label: 'pg 探针数量' }),
  createTextField('sensitiveCheck', { label: '敏感词校验(true,false)' })
];
