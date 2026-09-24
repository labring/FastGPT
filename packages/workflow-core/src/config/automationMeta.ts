import type { ChatConfigPath, ConfigAutomationMeta } from './type';

/** 为系统配置补充 Agent 决策语义；字段结构和基础说明仍由 ChatConfig Schema 提供。 */
export const configAutomationMetaMap = {
  welcomeText: {
    agentHint: 'workflow:cli.config.welcome_text',
    capabilities: ['conversation-welcome']
  },
  autoExecute: {
    agentHint: 'workflow:cli.config.auto_execute',
    capabilities: ['automatic-conversation-start']
  },
  'autoExecute.open': {
    agentHint: 'workflow:cli.config.auto_execute_open',
    capabilities: ['automatic-conversation-start']
  },
  'autoExecute.defaultPrompt': {
    agentHint: 'workflow:cli.config.auto_execute_prompt',
    capabilities: ['automatic-conversation-start']
  },
  questionGuide: {
    agentHint: 'workflow:cli.config.question_guide',
    capabilities: ['follow-up-question-suggestions']
  },
  'questionGuide.open': {
    agentHint: 'workflow:cli.config.question_guide_open',
    capabilities: ['follow-up-question-suggestions']
  },
  'questionGuide.model': {
    agentHint: 'workflow:cli.config.question_guide_model',
    capabilities: ['follow-up-question-suggestions']
  },
  'questionGuide.customPrompt': {
    agentHint: 'workflow:cli.config.question_guide_prompt',
    capabilities: ['follow-up-question-suggestions']
  },
  ttsConfig: {
    agentHint: 'workflow:cli.config.tts',
    capabilities: ['text-to-speech']
  },
  whisperConfig: {
    agentHint: 'workflow:cli.config.whisper',
    capabilities: ['speech-to-text']
  },
  scheduledTriggerConfig: {
    agentHint: 'workflow:cli.config.scheduled_trigger',
    capabilities: ['scheduled-execution']
  },
  chatInputGuide: {
    agentHint: 'workflow:cli.config.chat_input_guide',
    capabilities: ['custom-chat-input']
  },
  fileSelectConfig: {
    agentHint: 'workflow:cli.config.file_select',
    capabilities: ['user-file-input']
  },
  instruction: {
    agentHint: 'workflow:cli.config.instruction',
    capabilities: ['conversation-instructions']
  }
} satisfies Record<ChatConfigPath, ConfigAutomationMeta>;
