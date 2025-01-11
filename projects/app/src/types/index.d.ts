import {
  AudioSpeechModelType,
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  ReRankModelItemType,
  VectorModelItemType,
  STTModelType
} from '@fastgpt/global/core/ai/model.d';
import { TrackEventName } from '@/web/common/system/constants';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

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
