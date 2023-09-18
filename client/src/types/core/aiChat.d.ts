export type AIChatProps = {
  model: string;
  systemPrompt: string;
  temperature: number;
  maxToken: number;
  quoteTemplate?: string;
  quotePrompt?: string;
  frequency: number;
  presence: number;
};
