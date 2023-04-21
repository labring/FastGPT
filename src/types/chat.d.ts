export type ChatItemType = {
  obj: 'Human' | 'AI' | 'SYSTEM';
  value: string;
  deleted?: boolean;
};

export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;

export type HistoryItem = {
  chatId: string;
  title: string;
  history?: ChatSiteItemType[];
};
