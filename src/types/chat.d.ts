export type ChatItemSimpleType = {
  obj: 'Human' | 'AI' | 'SYSTEM';
  value: string;
};
export type ChatItemType = {
  _id: string;
} & ChatItemSimpleType;
