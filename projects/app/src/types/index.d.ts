import {
  TTSModelType,
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  RerankModelItemType,
  EmbeddingModelItemType,
  STTModelType
} from '@fastgpt/global/core/ai/model.d';
import type { TrackEventName } from '@/web/common/system/constants';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

declare global {
  var qaQueueLen: number;
  var vectorQueueLen: number;
  var datasetParseQueueLen: number;

  interface Window {
    grecaptcha: any;
    QRCode: any;
    umami?: {
      track: (event: TrackEventName, data: any) => void;
    };
  }
}
