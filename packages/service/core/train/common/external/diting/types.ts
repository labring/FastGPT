/** DiTing generate single evaluation data request */
export type DiTingSyntheticEvalDataRequest = {
  synthesizerConfig: {
    synthesizerName: string;
  };
  inputData: {
    context: string[];
  };
  llm_config: {
    name: string;
    timeout?: number;
  };
};

/** DiTing generate single evaluation data response */
export type DiTingSyntheticEvalDataResponse = {
  success: boolean;
  requestId?: string;
  status?: string;
  data?: {
    qaPair: {
      question: string;
      answer: string;
    };
    metadata?: {
      synthesizer: string;
    };
  };
  usages?: Array<{
    modelType: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
  error?: string;
};
