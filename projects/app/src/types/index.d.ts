import {
  AudioSpeechModelType,
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType,
  WhisperModelType
} from '@fastgpt/global/core/ai/model.d';
import { TrackEventName } from '@/constants/common';
import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type';

export type PagingData<T> = {
  pageNum: number;
  pageSize: number;
  data: T[];
  total?: number;
};

export type RequestPaging = { pageNum: number; pageSize: number; [key]: any };

declare global {
  var qaQueueLen: number;
  var vectorQueueLen: number;

  var vectorModels: VectorModelItemType[];
  var chatModels: ChatModelItemType[];
  var qaModels: LLMModelItemType[];
  var cqModels: FunctionModelItemType[];
  var extractModels: FunctionModelItemType[];
  var qgModels: LLMModelItemType[];
  var audioSpeechModels: AudioSpeechModelType[];
  var whisperModel: WhisperModelType;

  var priceMd: string;
  var systemVersion: string;

  var simpleModeTemplates: AppSimpleEditConfigTemplateType[];

  interface Window {
    ['pdfjs-dist/build/pdf']: any;
    grecaptcha: any;
    QRCode: any;
    umami?: {
      track: (event: `${TrackEventName}`, data: any) => void;
    };
  }
}
