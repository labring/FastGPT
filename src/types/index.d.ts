import type { Mongoose } from 'mongoose';
import type { Agent } from 'http';
import type { Pool } from 'pg';

declare global {
  var mongodb: Mongoose | string | null;
  var pgClient: Pool | null;
  var httpsAgent: Agent;
  var particlesJS: any;
  var grecaptcha: any;
  var QRCode: any;
  var qaQueueLen: number;
  var vectorQueueLen: number;

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
