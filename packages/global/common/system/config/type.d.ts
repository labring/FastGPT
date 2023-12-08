import { SystemConfigsTypeEnum } from "./constants";

export type SystemConfigsType = {
  _id: string;
  type: `${SystemConfigsTypeEnum}`;
  value: Record<string, any>;
  createTime: Date;
};