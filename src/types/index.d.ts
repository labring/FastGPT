import type { Mongoose } from 'mongoose';
import type { RedisClientType } from 'redis';
import type { Agent } from 'http';
import type { Pool } from 'pg';

declare global {
  var mongodb: Mongoose | string | null;
  var redisClient: RedisClientType | null;
  var pgClient: Pool | null;
  var generatingQA: boolean;
  var generatingAbstract: boolean;
  var generatingVector: boolean;
  var QRCode: any;
  var httpsAgentFast: Agent;
  var httpsAgentNormal: Agent;

  interface Window {
    ['pdfjs-dist/build/pdf']: any;
  }
}

export type PagingData<T> = {
  pageNum;
  pageSize;
  data: T[];
  total;
};

export type RequestPaging = { pageNum: number; pageSize: number; [key]: any };
