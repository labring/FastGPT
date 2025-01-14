import { i18nT } from '../../../web/i18n/utils';

export type ModelProviderIdType =
  | 'OpenAI'
  | 'Claude'
  | 'Gemini'
  | 'Meta'
  | 'MistralAI'
  | 'Groq'
  | 'AliCloud'
  | 'Qwen'
  | 'Doubao'
  | 'ChatGLM'
  | 'DeepSeek'
  | 'Ernie'
  | 'Moonshot'
  | 'MiniMax'
  | 'SparkDesk'
  | 'Hunyuan'
  | 'Baichuan'
  | 'StepFun'
  | 'Yi'
  | 'Ollama'
  | 'BAAI'
  | 'FishAudio'
  | 'Other';

export type ModelProviderType = {
  id: ModelProviderIdType;
  name: string;
  avatar: string;
};

export const ModelProviderList: ModelProviderType[] = [
  {
    id: 'OpenAI',
    name: 'OpenAI',
    avatar: 'model/openai'
  },
  {
    id: 'Claude',
    name: 'Claude',
    avatar: 'model/claude'
  },
  {
    id: 'Gemini',
    name: 'Gemini',
    avatar: 'model/gemini'
  },
  {
    id: 'Meta',
    name: 'Meta',
    avatar: 'model/meta'
  },
  {
    id: 'MistralAI',
    name: 'MistralAI',
    avatar: 'model/mistral'
  },
  {
    id: 'Groq',
    name: 'Groq',
    avatar: 'model/groq'
  },
  {
    id: 'AliCloud',
    name: i18nT('common:model_alicloud'),
    avatar: 'model/alicloud'
  },
  {
    id: 'Qwen',
    name: i18nT('common:model_qwen'),
    avatar: 'model/qwen'
  },
  {
    id: 'Doubao',
    name: i18nT('common:model_doubao'),
    avatar: 'model/doubao'
  },
  {
    id: 'ChatGLM',
    name: i18nT('common:model_chatglm'),
    avatar: 'model/chatglm'
  },
  {
    id: 'Ernie',
    name: i18nT('common:model_ernie'),
    avatar: 'model/ernie'
  },
  {
    id: 'DeepSeek',
    name: 'DeepSeek',
    avatar: 'model/deepseek'
  },
  {
    id: 'Moonshot',
    name: i18nT('common:model_moonshot'),
    avatar: 'model/moonshot'
  },
  {
    id: 'MiniMax',
    name: 'MiniMax',
    avatar: 'model/minimax'
  },
  {
    id: 'SparkDesk',
    name: i18nT('common:model_sparkdesk'),
    avatar: 'model/sparkDesk'
  },
  {
    id: 'Hunyuan',
    name: i18nT('common:model_hunyuan'),
    avatar: 'model/hunyuan'
  },
  {
    id: 'Baichuan',
    name: i18nT('common:model_baichuan'),
    avatar: 'model/baichuan'
  },
  {
    id: 'StepFun',
    name: i18nT('common:model_stepfun'),
    avatar: 'model/stepfun'
  },
  {
    id: 'Yi',
    name: i18nT('common:model_yi'),
    avatar: 'model/yi'
  },

  {
    id: 'Ollama',
    name: 'Ollama',
    avatar: 'model/ollama'
  },
  {
    id: 'BAAI',
    name: i18nT('common:model_baai'),
    avatar: 'model/BAAI'
  },
  {
    id: 'FishAudio',
    name: 'FishAudio',
    avatar: 'model/fishaudio'
  },
  {
    id: 'Other',
    name: i18nT('common:model_other'),
    avatar: 'model/huggingface'
  }
];
export const ModelProviderMap = Object.fromEntries(
  ModelProviderList.map((item, index) => [item.id, { ...item, order: index }])
);

export const getModelProvider = (provider: ModelProviderIdType) => {
  return ModelProviderMap[provider] ?? ModelProviderMap.Other;
};
