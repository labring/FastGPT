import type { CorrectionDataType, ChatCorrectionSchemaType } from './type';
import type { PaginationProps } from '../../../../web/common/fetch/type';
// Correction API Types
export type SubmitChatCorrectionParams = {
  appId: string;
  chatId: string;
  dataId: string;
  correctionData: CorrectionDataType;
  modelName: string;
};

export type SubmitChatCorrectionResponse = {
  correctionId: string;
};

export type ListChatCorrectionParams = {
  appId: string;
  chatId?: string;
  dataId?: string;
  correctionId?: string;
};

export type ListChatCorrectionResponse = {
  _id: string;
  dataId: string;
  chatId: string;
  appId: string;
  correctionData: CorrectionDataType;
  createTime: Date;
  updateTime: Date;
  userName?: string;
}[];

export type DeleteChatCorrectionParams = {
  appId: string;
  chatId?: string;
  correctionId: string;
};

export type DeleteChatCorrectionResponse = {};

// Quote Search API Types
export type GetKeywordQuoteParams = PaginationProps<{
  chatId: string;
  appId: string;
  keyword: string;

  // filter params
  datasetIds: string[];
  collectionIds?: string[];

  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
}>;

export type GetKeywordQuoteResponse = {
  list: Array<{
    datasetDataId: string;
    q: string;
    a?: string;
    sourceName?: string;
  }>;
  total: number; // 总条数，用于分页
};
