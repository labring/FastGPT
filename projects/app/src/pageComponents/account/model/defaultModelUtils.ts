import type { GetSystemDefaultModelResponse } from '@fastgpt/global/openapi/core/ai/model/api';

// Scene i18n keys (config_model namespace) for the 9 system default model
// fields (design §11.2).
const defaultModelSceneKeyMap: Record<keyof GetSystemDefaultModelResponse, string> = {
  llm: 'default_model_scene_llm',
  embedding: 'default_model_scene_embedding',
  tts: 'default_model_scene_tts',
  stt: 'default_model_scene_stt',
  rerank: 'default_model_scene_rerank',
  datasetTextLLM: 'default_model_scene_dataset_text',
  datasetImageLLM: 'default_model_scene_dataset_image',
  chatTitleLLM: 'default_model_scene_chat_title',
  helperBotLLM: 'default_model_scene_helper_bot'
};

/**
 * Which system default scenes reference the given modelId (design §11.2).
 * Returns config_model i18n keys of the affected scenes; used before
 * deactivating/deleting a model that is configured as a system default.
 */
export const findDefaultModelScenes = (
  defaults: GetSystemDefaultModelResponse | undefined,
  modelId?: string
): string[] => {
  if (!defaults || !modelId) return [];

  return (
    Object.entries(defaults) as [keyof GetSystemDefaultModelResponse, { id?: string } | null][]
  )
    .filter(([, value]) => value?.id === modelId)
    .map(([key]) => defaultModelSceneKeyMap[key] ?? key);
};
