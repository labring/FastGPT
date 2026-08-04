export const CHAT_CONFIG_PATHS = [
  'welcomeText',
  'autoExecute',
  'autoExecute.open',
  'autoExecute.defaultPrompt',
  'questionGuide',
  'questionGuide.open',
  'questionGuide.model',
  'questionGuide.customPrompt',
  'ttsConfig',
  'whisperConfig',
  'scheduledTriggerConfig',
  'chatInputGuide',
  'fileSelectConfig',
  'instruction'
] as const;

export type ChatConfigPath = (typeof CHAT_CONFIG_PATHS)[number];

export type ConfigAutomationMeta = {
  agentHint?: string;
  capabilities?: string[];
};

export type ConfigDescriptor = {
  path: ChatConfigPath;
  description: string;
  valueSchema: Record<string, unknown>;
  capabilities: string[];
  value: unknown;
};
