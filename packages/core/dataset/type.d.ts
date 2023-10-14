import { DatasetTypeEnum } from './constant';

export type DatasetSchemaType = {
  _id: string;
  userId: string;
  parentId: string;
  updateTime: Date;
  avatar: string;
  name: string;
  vectorModel: string;
  tags: string[];
  type: `${DatasetTypeEnum}`;
};
