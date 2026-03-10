// CAMB AI API request/response types

// === Translation ===
export type CambTranslateRequest = {
  texts: string[];
  source_language: number;
  target_language: number;
};

export type CambTaskResponse = {
  task_id: string;
  run_id: number | null;
};

export type CambTaskStatusResponse = {
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  run_id: number | null;
  exception_reason: string | null;
  message: string | null;
};

export type CambTranslationResultResponse = {
  texts: string[];
};

// === TTS ===
export type CambTTSStreamRequest = {
  text: string;
  voice_id: number;
  language?: string; // String locale code, e.g. 'en-us', 'zh-cn' (NOT numeric)
  speed?: number;
};

// === Voice Cloning ===
export type CambCreateVoiceRequest = {
  voice_name: string;
  audio_url?: string;
  gender?: number;
};

export type CambCreateVoiceResponse = {
  voice_id: number;
  status: string;
};

// === Translated TTS ===
export type CambTranslatedTTSRequest = {
  text: string;
  voice_id: number;
  source_language: number;
  target_language: number;
  speed?: number;
};

export type CambTranslatedTTSResultResponse = {
  audio_url?: string;
  translated_text?: string;
};

// === List Voices ===
export type CambVoice = {
  id: number;
  voice_name: string;
  language: number | null;
  gender: number;
  age: number;
  transcript: string | null;
  description: string | null;
  is_published: boolean;
};

// List voices returns CambVoice[] directly (not wrapped)
