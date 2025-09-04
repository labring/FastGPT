import { findModelFromAlldata } from '../../ai/model';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { addLog } from '../../../common/system/log';

/**
 * Get token limit for evaluation summary report generation
 * Based on evaluator's llm_model or default model, context length minus 1k as upper limit
 */
export const getEvaluationSummaryTokenLimit = (llmModel?: string): number => {
  try {
    let modelConfig: LLMModelItemType | undefined;

    if (llmModel) {
      // Try to get specified model configuration
      modelConfig = findModelFromAlldata(llmModel) as LLMModelItemType;
      if (modelConfig?.type !== 'llm') {
        modelConfig = undefined;
      }
    }

    // If no model is specified or model doesn't exist, use default LLM model
    if (!modelConfig) {
      modelConfig = global.systemDefaultModel?.llm as LLMModelItemType;
    }

    if (!modelConfig) {
      addLog.warn('[EvaluationSummary] No available LLM model found, using default token limit');
      return 3072;
    }

    // Calculate token limit: model max context - 1k (reserved for response)
    const tokenLimit = Math.max(modelConfig.maxContext - 1024, 1024);

    addLog.info('[EvaluationSummary] Calculate token limit', {
      llmModel: llmModel || 'default',
      modelName: modelConfig.name,
      maxContext: modelConfig.maxContext,
      tokenLimit
    });

    return tokenLimit;
  } catch (error) {
    addLog.error('[EvaluationSummary] Token limit calculation failed', {
      llmModel,
      error
    });
    // Fallback value
    return 3072;
  }
};

/**
 * Utility functions for updating token limit configuration
 * Convenient for flexible adjustment of request token limits in the future
 */
export const updateTokenLimitConfig = {
  /**
   * Number of tokens reserved for response
   * This value can be adjusted as needed
   */
  RESPONSE_RESERVE_TOKENS: 1024,

  /**
   * Minimum token limit
   * Ensure there are enough tokens for basic prompt
   */
  MIN_TOKEN_LIMIT: 1024,

  /**
   * Get response reserved token count
   */
  getResponseReserveTokens(): number {
    return this.RESPONSE_RESERVE_TOKENS;
  },

  /**
   * Set response reserved token count
   */
  setResponseReserveTokens(tokens: number): void {
    if (tokens > 0) {
      this.RESPONSE_RESERVE_TOKENS = tokens;
    }
  },

  /**
   * Get minimum token limit
   */
  getMinTokenLimit(): number {
    return this.MIN_TOKEN_LIMIT;
  },

  /**
   * Set minimum token limit
   */
  setMinTokenLimit(tokens: number): void {
    if (tokens > 0) {
      this.MIN_TOKEN_LIMIT = tokens;
    }
  }
};

/**
 * Use configurable token limit calculation function
 */
export const getConfigurableTokenLimit = (llmModel?: string): number => {
  try {
    let modelConfig: LLMModelItemType | undefined;

    if (llmModel) {
      modelConfig = findModelFromAlldata(llmModel) as LLMModelItemType;
      if (modelConfig?.type !== 'llm') {
        modelConfig = undefined;
      }
    }

    if (!modelConfig) {
      modelConfig = global.systemDefaultModel?.llm as LLMModelItemType;
    }

    if (!modelConfig) {
      return Math.max(
        4096 - updateTokenLimitConfig.getResponseReserveTokens(),
        updateTokenLimitConfig.getMinTokenLimit()
      );
    }

    const tokenLimit = Math.max(
      modelConfig.maxContext - updateTokenLimitConfig.getResponseReserveTokens(),
      updateTokenLimitConfig.getMinTokenLimit()
    );

    return tokenLimit;
  } catch (error) {
    return Math.max(
      4096 - updateTokenLimitConfig.getResponseReserveTokens(),
      updateTokenLimitConfig.getMinTokenLimit()
    );
  }
};
