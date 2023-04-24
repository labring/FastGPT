export type ChatItemType = {
  obj: 'Human' | 'AI' | 'SYSTEM';
  value: string;
  deleted?: boolean;
};
