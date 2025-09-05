import type {
  SynthesisCase,
  SynthesizerConfig,
  DatasetSynthesisResponse,
  EvalModelConfigType,
  SynthesisResult
} from '@fastgpt/global/core/evaluation/metric/type';
import { getLLMModel, getEmbeddingModel } from '../../ai/model';
import { createDitingSynthesisClient } from './ditingSynthesisClient';

export abstract class Synthesizer {
  protected synthesizerConfig: SynthesizerConfig;
  protected llmConfig?: EvalModelConfigType;
  protected embeddingConfig?: EvalModelConfigType;

  constructor(
    synthesizerConfig: SynthesizerConfig,
    llmConfig?: EvalModelConfigType,
    embeddingConfig?: EvalModelConfigType
  ) {
    this.llmConfig = llmConfig;
    this.embeddingConfig = embeddingConfig;
    this.synthesizerConfig = synthesizerConfig;
  }

  abstract synthesize(synthesisCase: SynthesisCase): Promise<SynthesisResult>;
}

export class DitingSynthesizer extends Synthesizer {
  private client: ReturnType<typeof createDitingSynthesisClient>;

  constructor(
    synthesizerConfig: SynthesizerConfig,
    llmConfig?: EvalModelConfigType,
    embeddingConfig?: EvalModelConfigType
  ) {
    super(synthesizerConfig, llmConfig, embeddingConfig);
    this.client = createDitingSynthesisClient();
  }

  async synthesize(synthesisCase: SynthesisCase): Promise<SynthesisResult> {
    const response: DatasetSynthesisResponse = await this.client.runSynthesis({
      inputData: {
        context: synthesisCase.context,
        themes: synthesisCase.themes
      },
      synthesizerConfig: this.synthesizerConfig,
      llmConfig: this.llmConfig!,
      embeddingConfig: this.embeddingConfig
    });

    if (response.status === 'success' && response.data) {
      return {
        synthesisName: this.synthesizerConfig.synthesizerName,
        status: response.status,
        data: response.data,
        usages: response.usages,
        error: response.error,
        totalPoints: 0
      };
    } else {
      throw new Error(response.error || 'Synthesis failed');
    }
  }
}

export function createSynthesizerInstance(
  synthesizerName: string,
  llmConfig?: EvalModelConfigType,
  embeddingConfig?: EvalModelConfigType
): Synthesizer {
  const synthesizerConfig: SynthesizerConfig = {
    synthesizerName: synthesizerName
  };

  if (llmConfig?.name) {
    try {
      const llm = getLLMModel(llmConfig.name);
      llmConfig = {
        ...llmConfig,
        baseUrl: llm.requestUrl || '',
        apiKey: llm.requestAuth || ''
      };
    } catch (err) {
      throw new Error(`Get LLM model failed: ${(err as Error).message}`);
    }
  }

  if (embeddingConfig?.name) {
    try {
      const embedding = getEmbeddingModel(embeddingConfig.name);
      embeddingConfig = {
        ...embeddingConfig,
        baseUrl: embedding.requestUrl || '',
        apiKey: embedding.requestAuth || ''
      };
    } catch (err) {
      throw new Error(`Get embedding model failed: ${(err as Error).message}`);
    }
  }

  return new DitingSynthesizer(synthesizerConfig, llmConfig, embeddingConfig);
}
