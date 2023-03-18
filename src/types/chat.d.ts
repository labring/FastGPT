export type ChatItemType = {
  obj: 'Human' | 'AI' | 'SYSTEM';
  value: string;
};

export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;

export type HistoryItem = {
  chatId: string;
  title: string;
};
