import type { Mongoose } from 'mongoose';
import type { Agent } from 'http';
import type { Pool } from 'pg';
import type { Tiktoken } from '@dqbd/tiktoken';

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
  var particlesJS: any;
  var grecaptcha: any;
  var QRCode: any;
  var qaQueueLen: number;
  var vectorQueueLen: number;
  var OpenAiEncMap: Record<string, Tiktoken>;
  var systemEnv: {
    vectorMaxProcess: number;
    qaMaxProcess: number;
    pgIvfflatProbe: number;
    sensitiveCheck: boolean;
  };

  interface Window {
    ['pdfjs-dist/build/pdf']: any;
  }
}
