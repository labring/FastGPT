import { AiModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import {
  STTModelType,
  ReRankModelItemType,
  AudioSpeechModelType,
  VectorModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.d';

export type SystemModelItemType = (
  | LLMModelItemType
  | VectorModelItemType
  | AudioSpeechModelType
  | STTModelType
  | ReRankModelItemType
) & { type: `${ModelTypeEnum}` };

declare global {
  var systemModelList: SystemModelItemType[];
}
