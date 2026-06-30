import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  AIChatNodeProps,
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

export type ChatProps = ModuleDispatchProps<
  AIChatNodeProps & {
    [NodeInputKeyEnum.userChatInput]?: string;
    [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
    [NodeInputKeyEnum.aiChatDatasetQuote]?: SearchDataResponseItemType[];
  }
>;

export type ChatResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.answerText]: string;
    [NodeOutputKeyEnum.reasoningText]?: string;
    [NodeOutputKeyEnum.history]: ChatItemMiniType[];
  },
  {
    [NodeOutputKeyEnum.errorText]: string;
  }
>;

export type ChatMessageFileParser = (urls: string[]) => Promise<
  {
    id?: string;
    name: string;
    url: string;
    sandboxPath?: string;
    content?: string;
  }[]
>;
