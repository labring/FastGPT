export type ContextExtractAgentItemType = {
  valueType: 'string' | 'number' | 'boolean';
  desc: string;
  key: string;
  required: boolean;
  defaultValue?: string;
  enum?: string;
};
