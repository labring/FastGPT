import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
/* ai chat modules props */
export type AIChatProps = {
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]?: string;
  [ModuleInputKeyEnum.aiChatTemperature]: number;
  [ModuleInputKeyEnum.aiChatMaxToken]: number;
  [ModuleInputKeyEnum.aiChatIsResponseText]: boolean;
  [ModuleInputKeyEnum.aiChatQuoteTemplate]?: string;
  [ModuleInputKeyEnum.aiChatQuotePrompt]?: string;
};
