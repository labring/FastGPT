export enum CorrectionModeEnum {
  edit = 'edit',
  annotate = 'annotate'
}

export type CorrectionIndexItem = {
  type: 'q' | 'a' | 'c';
  dataId: string;
};

export type CorrectedQuoteItem = {
  datasetDataId: string;
  q: string;
  a: string;
  updateTime?: Date;
  sourceName: string;
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
  userName: string;
  chatId: string;
  appId: string;
  correctionData: CorrectionDataType;
  createTime: Date;
  updateTime: Date;
};

export type SubmitChatCorrectionParams = {
  appId: string;
  chatId: string;
  dataId: string;
  correctionData: CorrectionDataType;
  modelName: string;
};

export type GetKeywordQuoteResponse = {
  list: Array<{
    datasetDataId: string;
    q: string;
    a?: string;
    sourceName?: string;
  }>;
  total: number; // 总条数，用于分页
};
