import type { CorrectionModeEnum } from './constants';

export type CorrectionIndexItem = {
  type: 'q' | 'a' | 'c';
  dataId: string;
};

export type CorrectedQuoteItem = {
  datasetDataId: string;
  q: string;
  a?: string;
  sourceName?: string;
  updateTime?: Date;
};

export type CorrectionDataType = {
  correctionMode: CorrectionModeEnum;
  question: string;
  rawAnswer: string;
  correctedAnswer?: string;
  correctedQuoteList?: CorrectedQuoteItem[];
  indexs?: CorrectionIndexItem[];
};

export type ChatCorrectionSchemaType = {
  _id: string;
  dataId: string;
  teamId: string;
  tmbId: string;
  userId: string;
  chatId: string;
  appId: string;
  correctionData: CorrectionDataType;
  createTime: Date;
  updateTime: Date;
};
