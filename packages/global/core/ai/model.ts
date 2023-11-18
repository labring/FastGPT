import type {
  LLMModelItemType,
  ChatModelItemType,
  FunctionModelItemType,
  VectorModelItemType,
  AudioSpeechModelType,
  WhisperModelType
} from './model.d';

export const defaultChatModels: ChatModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-1106',
    name: 'GPT35-1106',
    price: 0,
    maxContext: 16000,
    maxResponse: 4000,
    quoteMaxToken: 2000,
    maxTemperature: 1.2,
    censor: false,
    vision: false,
    defaultSystemChatPrompt: ''
  },
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxContext: 16000,
    maxResponse: 16000,
    price: 0,
    quoteMaxToken: 8000,
    maxTemperature: 1.2,
    censor: false,
    vision: false,
    defaultSystemChatPrompt: ''
  },
  {
    model: 'gpt-4',
    name: 'GPT4-8k',
    maxContext: 8000,
    maxResponse: 8000,
    price: 0,
    quoteMaxToken: 4000,
    maxTemperature: 1.2,
    censor: false,
    vision: false,
    defaultSystemChatPrompt: ''
  },
  {
    model: 'gpt-4-vision-preview',
    name: 'GPT4-Vision',
    maxContext: 128000,
    maxResponse: 4000,
    price: 0,
    quoteMaxToken: 100000,
    maxTemperature: 1.2,
    censor: false,
    vision: true,
    defaultSystemChatPrompt: ''
  }
];
export const defaultQAModels: LLMModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxContext: 16000,
    maxResponse: 16000,
    price: 0
  }
];
export const defaultCQModels: FunctionModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-1106',
    name: 'GPT35-1106',
    maxContext: 16000,
    maxResponse: 4000,
    price: 0,
    functionCall: true,
    functionPrompt: ''
  },
  {
    model: 'gpt-4',
    name: 'GPT4-8k',
    maxContext: 8000,
    maxResponse: 8000,
    price: 0,
    functionCall: true,
    functionPrompt: ''
  }
];
export const defaultExtractModels: FunctionModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-1106',
    name: 'GPT35-1106',
    maxContext: 16000,
    maxResponse: 4000,
    price: 0,
    functionCall: true,
    functionPrompt: ''
  }
];
export const defaultQGModels: LLMModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-1106',
    name: 'GPT35-1106',
    maxContext: 1600,
    maxResponse: 4000,
    price: 0
  }
];

export const defaultVectorModels: VectorModelItemType[] = [
  {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0,
    defaultToken: 500,
    maxToken: 3000
  }
];

export const defaultAudioSpeechModels: AudioSpeechModelType[] = [
  {
    model: 'tts-1',
    name: 'OpenAI TTS1',
    price: 0,
    voices: [
      { label: 'Alloy', value: 'Alloy', bufferId: 'openai-Alloy' },
      { label: 'Echo', value: 'Echo', bufferId: 'openai-Echo' },
      { label: 'Fable', value: 'Fable', bufferId: 'openai-Fable' },
      { label: 'Onyx', value: 'Onyx', bufferId: 'openai-Onyx' },
      { label: 'Nova', value: 'Nova', bufferId: 'openai-Nova' },
      { label: 'Shimmer', value: 'Shimmer', bufferId: 'openai-Shimmer' }
    ]
  }
];

export const defaultWhisperModel: WhisperModelType = {
  model: 'whisper-1',
  name: 'Whisper1',
  price: 0
};
