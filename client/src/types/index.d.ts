import type { Mongoose } from 'mongoose';
import type { Agent } from 'http';
import type { Pool } from 'pg';
import type { Tiktoken } from '@dqbd/tiktoken';
import { ChatModelItemType, QAModelItemType, VectorModelItemType } from './model';

export type PagingData<T> = {
  pageNum: number;
  pageSize: number;
  data: T[];
  total?: number;
};

export type RequestPaging = { pageNum: number; pageSize: number; [key]: any };

declare global {
  var mongodb: Mongoose | string | null;
  var pgClient: Pool | null;
  var httpsAgent: Agent;
  var qaQueueLen: number;
  var vectorQueueLen: number;
  var OpenAiEncMap: Tiktoken;
  var sendInformQueue: (() => Promise<void>)[];
  var sendInformQueueLen: number;
  var systemEnv: {
    vectorMaxProcess: number;
    qaMaxProcess: number;
    pgIvfflatProbe: number;
    sensitiveCheck: boolean;
  };
  var chatModels: ChatModelItemType[];
  var qaModels: QAModelItemType[];
  var vectorModels: VectorModelItemType[];

  interface Window {
    ['pdfjs-dist/build/pdf']: any;
    particlesJS: any;
    grecaptcha: any;
    QRCode: any;
  }
}
