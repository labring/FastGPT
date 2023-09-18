import type { Mongoose } from 'mongoose';
import type { Agent } from 'http';
import type { Pool } from 'pg';
import type { Tiktoken } from 'js-tiktoken';
import type { Logger } from 'winston';
import { ChatModelItemType, QAModelItemType, VectorModelItemType } from './model';
import { TrackEventName } from '@/constants/common';

export type PagingData<T> = {
  pageNum: number;
  pageSize: number;
  data: T[];
  total?: number;
};

export type RequestPaging = { pageNum: number; pageSize: number; [key]: any };

export type FeConfigsType = {
  show_emptyChat?: boolean;
  show_register?: boolean;
  show_appStore?: boolean;
  show_userDetail?: boolean;
  show_contact?: boolean;
  show_git?: boolean;
  show_doc?: boolean;
  show_openai_account?: boolean;
  openAPIUrl?: string;
  systemTitle?: string;
  authorText?: string;
  googleClientVerKey?: string;
  oauth?: {
    github?: string;
    google?: string;
  };
  limit?: {
    exportLimitMinutes?: number;
  };
  scripts?: { [key: string]: string }[];
};
export type SystemEnvType = {
  pluginBaseUrl?: string;
  openapiPrefix?: string;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  pgIvfflatProbe: number;
};

declare global {
  var mongodb: Mongoose | string | null;
  var pgClient: Pool | null;
  var httpsAgent: Agent;
  var qaQueueLen: number;
  var vectorQueueLen: number;
  var TikToken: Tiktoken;

  var logger: Logger;

  var sendInformQueue: (() => Promise<void>)[];
  var sendInformQueueLen: number;

  var feConfigs: FeConfigsType;
  var systemEnv: SystemEnvType;
  var chatModels: ChatModelItemType[];
  var qaModel: QAModelItemType;
  var vectorModels: VectorModelItemType[];
  var systemVersion: string;

  interface Window {
    ['pdfjs-dist/build/pdf']: any;
    grecaptcha: any;
    QRCode: any;
    umami?: {
      track: (event: `${TrackEventName}`, data: any) => void;
    };
  }
}
