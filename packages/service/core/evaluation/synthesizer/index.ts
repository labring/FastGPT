import type {
  SynthesisCase,
  SynthesizerConfig,
  DatasetSynthesisResponse,
  EvalModelConfigType,
  SynthesisResult
} from '@fastgpt/global/core/evaluation/metric/type';
import { getLLMModelById, getEmbeddingModelById } from '../../ai/model';
import { getModelEndpointConfig } from '../../ai/config';
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

  if (llmConfig?.modelId) {
    try {
      const llm = getLLMModelById(llmConfig.modelId);
      const endpoint = getModelEndpointConfig(llm);
      llmConfig = {
        ...llmConfig,
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey
      };
    } catch (err) {
      throw new Error(`Get LLM model failed: ${(err as Error).message}`);
    }
  }

  if (embeddingConfig?.modelId) {
    try {
      const embedding = getEmbeddingModelById(embeddingConfig.modelId);
      const endpoint = getModelEndpointConfig(embedding);
      embeddingConfig = {
        ...embeddingConfig,
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey
      };
    } catch (err) {
      throw new Error(`Get embedding model failed: ${(err as Error).message}`);
    }
  }

  return new DitingSynthesizer(synthesizerConfig, llmConfig, embeddingConfig);
}
