import { type DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';

export const quoteDataFieldSelector =
  '_id teamId datasetId q a imageId history updateTime chunkIndex';

export type QuoteDataItemType = {
  _id: string;
  q: string;
  a?: string;
  imagePreivewUrl?: string;
  history?: DatasetDataSchemaType['history'];
  updateTime: DatasetDataSchemaType['updateTime'];
  index: DatasetDataSchemaType['chunkIndex'];
  updated?: boolean;
};
