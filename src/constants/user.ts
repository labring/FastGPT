export enum BillTypeEnum {
  chat = 'chat',
  splitData = 'splitData',
  return = 'return'
}
export enum PageTypeEnum {
  login = 'login',
  register = 'register',
  forgetPassword = 'forgetPassword'
}

export const BillTypeMap: Record<`${BillTypeEnum}`, string> = {
  [BillTypeEnum.chat]: '对话',
  [BillTypeEnum.splitData]: '文本拆分',
  [BillTypeEnum.return]: '退款'
};
