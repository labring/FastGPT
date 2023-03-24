import type { Mongoose } from 'mongoose';

declare global {
  var mongodb: Mongoose | string | null;
  var generatingQA: boolean;
  var QRCode: any;
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

export type RequestPaging = { pageNum: number; pageSize: number };
