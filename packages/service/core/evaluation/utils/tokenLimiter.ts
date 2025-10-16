import { findModelFromAlldata, getEvaluationModel } from '../../ai/model';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { addLog } from '../../../common/system/log';
import { MAX_TOKEN_FOR_EVALUATION_SUMMARY } from '@fastgpt/global/core/evaluation/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export const getEvaluationSummaryModel = (llmModel?: string): LLMModelItemType => {
  let evalutionModel = getEvaluationModel(llmModel);
  if (evalutionModel) return evalutionModel;
  throw new Error(EvaluationErrEnum.summaryModelInvalid);
};

export const getEvaluationSummaryTokenLimit = (llmModel: string): number => {
  let modelConfig = getEvaluationSummaryModel(llmModel);

  // Calculate token limit: model max context - reserved tokens for response
  const tokenLimit = modelConfig.maxContext - MAX_TOKEN_FOR_EVALUATION_SUMMARY;

  addLog.debug('[EvaluationSummary] Calculate token limit', {
    llmModel: llmModel || 'default',
    modelName: modelConfig.name,
    maxContext: modelConfig.maxContext,
    tokenLimit
  });

  return tokenLimit;
};
