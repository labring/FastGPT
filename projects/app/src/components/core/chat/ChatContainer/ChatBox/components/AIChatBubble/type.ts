import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';

export type AIChatBubbleContentProps = {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
  isChatting: boolean;
  allowedCitationIds?: Set<string>;
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
};

export type IndexedAIChatValue = {
  value: AIChatItemValueItemType;
  index: number;
};
