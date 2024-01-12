// model price: xxx/1k tokens
// ￥1 = 100000.
export const PRICE_SCALE = 100000;

export enum BillSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  training = 'training',
  datasetExpand = 'datasetExpand'
}

export const BillSourceMap: Record<`${BillSourceEnum}`, string> = {
  [BillSourceEnum.fastgpt]: '在线使用',
  [BillSourceEnum.api]: 'Api',
  [BillSourceEnum.shareLink]: '免登录链接',
  [BillSourceEnum.training]: '数据训练',
  [BillSourceEnum.datasetExpand]: '知识库扩容'
};
