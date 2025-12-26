import { getRerankModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';

/**
 * Check if a model is a fine-tuned model created by training module
 * @param modelConfigId Model configuration ID
 * @returns true if it's a fine-tuned model, false otherwise
 */
export function isTunedModel(modelConfigId: string): boolean {
  const modelConfig = getRerankModel(modelConfigId);
  if (!modelConfig) {
    addLog.warn('Model config not found when checking if tuned', { modelConfigId });
    return false;
  }
  // Only models created by training module have isTuned flag
  return modelConfig.isTuned === true;
}
