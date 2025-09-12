import { validateTargetConfig } from '../target';
import { validateEvaluatorConfig } from '../evaluator';
import type { CreateEvaluationParams } from '@fastgpt/global/core/evaluation/type';
import type { ValidationResult } from '@fastgpt/global/core/evaluation/validate';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalNameRequired,
            message: 'Evaluation name is required',
            field: 'name'
          }
        ]
      };
    }

    if (!datasetId) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalDatasetIdRequired,
            message: 'Dataset ID is required',
            field: 'datasetId'
          }
        ]
      };
    }

    if (!target) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalTargetRequired,
            message: 'Evaluation target is required',
            field: 'target'
          }
        ]
      };
    }

    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalEvaluatorsRequired,
            message: 'At least one evaluator is required',
            field: 'evaluators'
          }
        ]
      };
    }
  }

  // For update mode, only validate provided fields
  if (name !== undefined) {
    if (!name || !name.trim()) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalNameRequired,
            message: 'Evaluation name is required',
            field: 'name'
          }
        ]
      };
    }

    if (name.length > 100) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalNameTooLong,
            message: 'Evaluation name is too long (max 100 characters)',
            field: 'name',
            debugInfo: { currentLength: name.length, maxLength: 100 }
          }
        ]
      };
    }
  }

  if (description !== undefined && description && description.length > 100) {
    return {
      isValid: false,
      errors: [
        {
          code: EvaluationErrEnum.evalDescriptionTooLong,
          message: 'Description is too long (max 100 characters)',
          field: 'description',
          debugInfo: { currentLength: description.length, maxLength: 100 }
        }
      ]
    };
  }

  if (datasetId !== undefined && !datasetId) {
    return {
      isValid: false,
      errors: [
        {
          code: EvaluationErrEnum.evalDatasetIdRequired,
          message: 'Dataset ID is required',
          field: 'datasetId'
        }
      ]
    };
  }

  if (target !== undefined) {
    if (!target) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalTargetRequired,
            message: 'Evaluation target is required',
            field: 'target'
          }
        ]
      };
    }

    // Validate target configuration using validateTargetConfig
    const targetValidation = await validateTargetConfig(target);
    if (!targetValidation.isValid) {
      return targetValidation; // Return the detailed validation result directly
    }
  }

  if (evaluators !== undefined) {
    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.evalEvaluatorsRequired,
            message: 'At least one evaluator is required',
            field: 'evaluators'
          }
        ]
      };
    }

    // Validate evaluators configuration using validateEvaluatorConfig
    for (let i = 0; i < evaluators.length; i++) {
      const evaluator = evaluators[i];

      // Detailed validation using validateEvaluatorConfig
      const evaluatorValidation = await validateEvaluatorConfig(evaluator);
      if (!evaluatorValidation.isValid) {
        // Prefix error messages with evaluator index for clarity
        const errors = evaluatorValidation.errors.map((err) => ({
          ...err,
          message: `Evaluator at index ${i}: ${err.message}`,
          field: `evaluators[${i}].${err.field || 'unknown'}`,
          debugInfo: {
            evaluatorIndex: i,
            ...err.debugInfo
          }
        }));
        return { isValid: false, errors };
      }
    }
  }

  return { isValid: true, errors: [] };
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
