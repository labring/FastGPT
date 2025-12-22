import type { CorrectionModeEnum } from './constants';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';

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

// 校正数据搜索相关类型
export type SearchCorrectionDataProps = {
  appId: string;
  userChatInput: string; // 传入的 userChatInput（已经是经过处理的标准化查询）
  teamId: string;
  vectorModel: EmbeddingModelItemType;
};

export type SearchCorrectionDataResult = {
  correctionId: string;
  correctedAnswer: string | undefined;
  question: string;
  similarity: number;
  chatId: string;
  dataId: string;
  embeddingTokens: number; // 记录向量生成实际消耗的token数量
} | null;
