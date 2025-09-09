import { validateTargetConfig } from '../target';
import type { CreateEvaluationParams } from '@fastgpt/global/core/evaluation/type';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export interface ValidationResult {
  success: boolean;
  message?: string;
}

export type EvaluationValidationParams = Partial<CreateEvaluationParams>;

export interface EvaluationValidationOptions {
  mode?: 'create' | 'update'; // validation mode
}

export async function validateEvaluationParams(
  params: EvaluationValidationParams,
  options?: EvaluationValidationOptions
): Promise<ValidationResult> {
  const { name, description, datasetId, target, evaluators } = params;
  const mode = options?.mode || 'create';
  const isCreateMode = mode === 'create';

  // For create mode, check all required fields are present
  if (isCreateMode) {
    if (!name || !name.trim()) {
      return {
        success: false,
        message: EvaluationErrEnum.evalNameRequired
      };
    }

    if (!datasetId) {
      return {
        success: false,
        message: EvaluationErrEnum.evalDatasetIdRequired
      };
    }

    if (!target) {
      return {
        success: false,
        message: EvaluationErrEnum.evalTargetRequired
      };
    }

    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      return {
        success: false,
        message: EvaluationErrEnum.evalEvaluatorsRequired
      };
    }
  }

  // For update mode, only validate provided fields
  if (name !== undefined) {
    if (!name || !name.trim()) {
      return {
        success: false,
        message: EvaluationErrEnum.evalNameRequired
      };
    }

    if (name.length > 100) {
      return {
        success: false,
        message: EvaluationErrEnum.evalNameTooLong
      };
    }
  }

  if (description !== undefined && description && description.length > 100) {
    return {
      success: false,
      message: EvaluationErrEnum.evalDescriptionTooLong
    };
  }

  if (datasetId !== undefined && !datasetId) {
    return {
      success: false,
      message: EvaluationErrEnum.evalDatasetIdRequired
    };
  }

  if (target !== undefined) {
    if (!target) {
      return {
        success: false,
        message: EvaluationErrEnum.evalTargetRequired
      };
    }

    // Validate target configuration using validateTargetConfig
    const targetValidation = await validateTargetConfig(target);
    if (!targetValidation.success) {
      return {
        success: false,
        message: EvaluationErrEnum.evalTargetInvalidConfig
      };
    }
  }

  if (evaluators !== undefined) {
    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      return {
        success: false,
        message: EvaluationErrEnum.evalEvaluatorsRequired
      };
    }

    // Validate evaluators configuration
    for (const evaluator of evaluators) {
      if (!evaluator.metric || !evaluator.metric._id || !evaluator.metric.type) {
        return {
          success: false,
          message: EvaluationErrEnum.evalEvaluatorInvalidConfig
        };
      }
    }
  }

  return { success: true };
}

export async function validateEvaluationParamsForCreate(
  params: EvaluationValidationParams
): Promise<ValidationResult> {
  return validateEvaluationParams(params, { mode: 'create' });
}

export async function validateEvaluationParamsForUpdate(
  params: EvaluationValidationParams
): Promise<ValidationResult> {
  return validateEvaluationParams(params, { mode: 'update' });
}
