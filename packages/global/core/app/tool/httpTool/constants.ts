export enum HttpToolTypeEnum {
  batch = 'batch',
  manual = 'manual'
}
export type HttpToolType = (typeof HttpToolTypeEnum)[keyof typeof HttpToolTypeEnum];
