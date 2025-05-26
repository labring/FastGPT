import { type DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';

export const quoteDataFieldSelector = '_id q a history updateTime chunkIndex imageFileId';

export type QuoteDataItemType = {
  _id: string;
  q: DatasetDataSchemaType['q'];
  a: DatasetDataSchemaType['a'];
  history?: DatasetDataSchemaType['history'];
  updateTime: DatasetDataSchemaType['updateTime'];
  index: DatasetDataSchemaType['chunkIndex'];
  imageFileId?: DatasetDataSchemaType['imageFileId'];
  updated?: boolean;
};
