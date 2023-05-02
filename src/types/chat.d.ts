export type ChatItemSimpleType = {
  obj: 'Human' | 'AI' | 'SYSTEM';
  value: string;
  systemPrompt?: string;
};
export type ChatItemType = {
  _id: string;
} & ChatItemSimpleType;
