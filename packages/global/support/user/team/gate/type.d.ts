export type GateTool = 'webSearch' | 'deepThinking' | 'fileUpload' | 'imageUpload' | 'voiceInput';

export type GateSchemaType = {
  teamId: string;
  status: boolean;
  tools: GateTool[];
  slogan: string;
  placeholderText: string;
};
