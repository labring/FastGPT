import { getVlmModel, getVlmModelList, getLLMModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type.d';
import type {
  CustomFileImportModeType,
  CustomLinkImportModeType,
  CustomEnhanceConfigType
} from '@fastgpt/global/common/system/types/index.d';

export type AdaptiveConfigParams = {
  dataset: DatasetSchemaType;
  modeConfig: CustomFileImportModeType | CustomLinkImportModeType;
};

export type AdaptiveAdjustment = {
  field: string;
  originalValue: any;
  adjustedValue: any;
  reason: string;
};

export type AdaptiveConfigResult = {
  adjustedEnhanceConfig: Partial<CustomEnhanceConfigType>;
  adjustedParseConfig: {
    customPdfParse?: boolean;
  };
  adjustments: AdaptiveAdjustment[];
};

/**
 * Check if VLM model is available
 */
function checkVlmModelAvailable(vlmModel?: string): boolean {
  // 1. Check if dataset has vlmModel configured
  if (!vlmModel) {
    return false;
  }

  // 2. Check if system has available VLM models
  const vlmModelList = getVlmModelList();
  if (!vlmModelList || vlmModelList.length === 0) {
    return false;
  }

  // 3. Check if configured model is in available list
  const model = getVlmModel(vlmModel);
  return !!model;
}

/**
 * Check if Agent model (LLM) is available
 */
function checkAgentModelAvailable(agentModel?: string): boolean {
  if (!agentModel) {
    return false;
  }

  // Agent model is LLM model, check if it exists in system model list
  const model = getLLMModel(agentModel);
  return !!model && model.model === agentModel;
}

/**
 * Check if PDF parsing service is available
 */
function checkPdfParseServiceAvailable(): boolean {
  const customPdfParse = global.systemEnv?.customPdfParse;

  // Check if custom parsing service URL or doc2x key is configured
  return !!(customPdfParse?.url || customPdfParse?.doc2xKey);
}

/**
 * Adaptively adjust import configuration based on actual system configuration
 * @param params Dataset and mode configuration
 * @returns Adjusted configuration and adjustment records
 */
export function adaptiveAdjustConfig(params: AdaptiveConfigParams): AdaptiveConfigResult {
  const { dataset, modeConfig } = params;
  const adjustments: AdaptiveAdjustment[] = [];

  // Deep copy enhanceConfig to avoid modifying original
  const adjustedEnhanceConfig: Partial<CustomEnhanceConfigType> = {
    ...modeConfig.enhanceConfig
  };

  const adjustedParseConfig: { customPdfParse?: boolean } = {};

  // 1. Check VLM model availability, adaptively adjust image index
  const hasVlmModel = checkVlmModelAvailable(dataset.vlmModel);
  if (adjustedEnhanceConfig.imageIndex && !hasVlmModel) {
    adjustments.push({
      field: 'imageIndex',
      originalValue: true,
      adjustedValue: false,
      reason: 'VLM model not configured or not available for this dataset'
    });
    adjustedEnhanceConfig.imageIndex = false;
  }

  // 2. Check Agent model availability, adaptively adjust AI-related indexes
  const hasAgentModel = checkAgentModelAvailable(dataset.agentModel);

  if (adjustedEnhanceConfig.autoIndexes && !hasAgentModel) {
    adjustments.push({
      field: 'autoIndexes',
      originalValue: true,
      adjustedValue: false,
      reason: 'Agent model not configured or not available for this dataset'
    });
    adjustedEnhanceConfig.autoIndexes = false;
  }

  if (adjustedEnhanceConfig.hypeIndexes && !hasAgentModel) {
    adjustments.push({
      field: 'hypeIndexes',
      originalValue: true,
      adjustedValue: false,
      reason: 'Agent model not configured or not available for this dataset'
    });
    adjustedEnhanceConfig.hypeIndexes = false;
  }

  if (adjustedEnhanceConfig.syntheticIndex && !hasAgentModel) {
    adjustments.push({
      field: 'syntheticIndex',
      originalValue: true,
      adjustedValue: false,
      reason: 'Agent model not configured or not available for this dataset'
    });
    adjustedEnhanceConfig.syntheticIndex = false;
  }

  // 3. Check PDF parsing service availability (only for file import)
  if ('parseConfig' in modeConfig && modeConfig.parseConfig) {
    const parseConfig = modeConfig.parseConfig as { customPdfParse?: boolean };
    if (parseConfig.customPdfParse && !checkPdfParseServiceAvailable()) {
      adjustments.push({
        field: 'customPdfParse',
        originalValue: true,
        adjustedValue: false,
        reason: 'PDF parsing service not configured (customPdfParse.url or doc2xKey required)'
      });
      adjustedParseConfig.customPdfParse = false;
    } else {
      adjustedParseConfig.customPdfParse = parseConfig.customPdfParse;
    }
  }

  return {
    adjustedEnhanceConfig,
    adjustedParseConfig,
    adjustments
  };
}

/**
 * Log adaptive adjustments for debugging
 */
export function logAdaptiveAdjustments(datasetId: string, adjustments: AdaptiveAdjustment[]): void {
  if (adjustments.length === 0) {
    return;
  }

  addLog.debug(`[AdaptiveConfig] Dataset ${datasetId} - Config adjustments applied:`);
  adjustments.forEach((adj) => {
    addLog.debug(`  - ${adj.field}: ${adj.originalValue} -> ${adj.adjustedValue} (${adj.reason})`);
  });
}
