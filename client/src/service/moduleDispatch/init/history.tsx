import { SystemInputEnum } from '@/constants/app';
import { ChatItemType } from '@/types/chat';

export type HistoryProps = {
  maxContext: number;
  [SystemInputEnum.history]: ChatItemType[];
};

export const dispatchHistory = (props: Record<string, any>) => {
  const { maxContext = 5, history = [] } = props as HistoryProps;

  return {
    history: maxContext > 0 ? history.slice(-maxContext) : []
  };
};
