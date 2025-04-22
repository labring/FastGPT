import { GateStatus, GateTool } from './type';

export const GATE_COLLECTION_NAME = 'team_gate';
export const GATE_HOME_COLLECTION_NAME = 'team_gate_home';
export const GATE_COPYRIGHT_COLLECTION_NAME = 'team_gate_copyright';
export const GATE_STATUS: Record<string, GateStatus> = {
  ENABLED: 'enabled',
  DISABLED: 'disabled'
};

export const GATE_TOOLS: Record<string, GateTool> = {
  WEB_SEARCH: 'webSearch',
  DEEP_THINKING: 'deepThinking',
  FILE_UPLOAD: 'fileUpload',
  IMAGE_UPLOAD: 'imageUpload',
  VOICE_INPUT: 'voiceInput'
};

export const DEFAULT_HOME_CONFIG = {
  status: GATE_STATUS.ENABLED,
  tools: [GATE_TOOLS.WEB_SEARCH, GATE_TOOLS.DEEP_THINKING],
  slogan: '你好👋，我是 FastGPT！请问有什么可以帮你?',
  placeholderText: '你可以问我任何问题'
};

export const DEFAULT_COPYRIGHT_CONFIG = {
  teamName: 'FastGPT',
  logos: []
};
