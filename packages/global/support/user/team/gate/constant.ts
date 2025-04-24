import { GateTool } from './type';

export const GATE_HOME_COLLECTION_NAME = 'team_gate_home';
export const GATE_COPYRIGHT_COLLECTION_NAME = 'team_gate_copyright';
export const GATE_STATUS: Record<string, boolean> = {
  ENABLED: true,
  DISABLED: false
};

export const GATE_TOOLS: Record<string, GateTool> = {
  WEB_SEARCH: 'webSearch',
  DEEP_THINKING: 'deepThinking',
  FILE_UPLOAD: 'fileUpload',
  IMAGE_UPLOAD: 'imageUpload',
  VOICE_INPUT: 'voiceInput'
};
