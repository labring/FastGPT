/** DiTing generate single evaluation data request */
export type DiTingSyntheticEvalDataRequest = {
  synthesizerConfig: {
    synthesizerName: string;
  };
  inputData: {
    context: string[];
    /** Number of QA pairs to generate from this context (1-to-many strategy) */
    numCases?: number;
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
    /** QA pairs returned by DiTing synthesizer (always an array, even for numCases=1) */
    qaPairs: Array<{
      question: string;
      answer: string;
    }>;
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
