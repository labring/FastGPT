import {
  AudioSpeechModelType,
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  ReRankModelItemType,
  VectorModelItemType,
  WhisperModelType
} from '@fastgpt/global/core/ai/model.d';
import { TrackEventName } from '@/web/common/system/constants';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

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

  interface Window {
    grecaptcha: any;
    QRCode: any;
    umami?: {
      track: (event: TrackEventName, data: any) => void;
    };
  }
}
