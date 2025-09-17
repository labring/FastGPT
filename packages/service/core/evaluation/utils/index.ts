import { validateTargetConfig } from '../target';
import { validateEvaluatorConfig } from '../evaluator';
import type { CreateEvaluationParams } from '@fastgpt/global/core/evaluation/type';
import type { ValidationResult } from '@fastgpt/global/core/evaluation/validate';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvalDatasetCollection } from '../dataset/evalDatasetCollectionSchema';
import { Types } from 'mongoose';

export type EvaluationValidationParams = Partial<CreateEvaluationParams>;

export interface EvaluationValidationOptions {
  mode?: 'create' | 'update'; // validation mode
  teamId?: string; // required for evalDatasetCollection existence validation
}

/**
 * Validate if a evalDatasetCollection exists and is accessible by the team
 */
async function validateEvalDatasetCollectionExists(
  evalDatasetCollectionId: string,
  teamId?: string
): Promise<ValidationResult> {
  // Validate evalDatasetCollectionId format
  if (!Types.ObjectId.isValid(evalDatasetCollectionId)) {
    return {
      isValid: false,
      errors: [
        {
          code: EvaluationErrEnum.datasetCollectionIdRequired,
          message: 'Invalid evalDatasetCollectionId format',
          field: 'evalDatasetCollectionId'
        }
      ]
    };
  }

  // Check if evalDatasetCollection exists
  const filter: any = { _id: new Types.ObjectId(evalDatasetCollectionId) };
  if (teamId) {
    filter.teamId = new Types.ObjectId(teamId);
  }

  const datasetCollection = await MongoEvalDatasetCollection.findOne(filter).lean();

  if (!datasetCollection) {
    return {
      isValid: false,
      errors: [
        {
          code: EvaluationErrEnum.datasetCollectionNotFound,
          message: 'evalDatasetCollection not found or access denied',
          field: 'evalDatasetCollectionId'
        }
      ]
    };
  }

  return { isValid: true, errors: [] };
}

export async function validateEvaluationParams(
  params: EvaluationValidationParams,
  options?: EvaluationValidationOptions
): Promise<ValidationResult> {
  const { name, description, evalDatasetCollectionId, target, evaluators } = params;
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

    if (!evalDatasetCollectionId) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.datasetCollectionIdRequired,
            message: 'datasetCollectionId is required',
            field: 'evalDatasetCollectionId'
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

    if (name.length > MAX_NAME_LENGTH) {
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

  if (description !== undefined && description && description.length > MAX_DESCRIPTION_LENGTH) {
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

  if (evalDatasetCollectionId !== undefined) {
    if (!evalDatasetCollectionId) {
      return {
        isValid: false,
        errors: [
          {
            code: EvaluationErrEnum.datasetCollectionIdRequired,
            message: 'datasetCollectionId is required',
            field: 'evalDatasetCollectionId'
          }
        ]
      };
    }

    // Validate evaldatasetcollection exists and is accessible
    const datasetValidation = await validateEvalDatasetCollectionExists(
      evalDatasetCollectionId,
      options?.teamId
    );
    if (!datasetValidation.isValid) {
      return datasetValidation;
    }
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

      // Validate scoreScaling if provided
      if (evaluator.scoreScaling !== undefined) {
        if (
          typeof evaluator.scoreScaling !== 'number' ||
          isNaN(evaluator.scoreScaling) ||
          !isFinite(evaluator.scoreScaling) ||
          evaluator.scoreScaling <= 0 ||
          evaluator.scoreScaling > 10000
        ) {
          return {
            isValid: false,
            errors: [
              {
                code: EvaluationErrEnum.evalEvaluatorInvalidScoreScaling,
                message: 'Evaluator scoreScaling invalid',
                field: 'scoreScaling'
              }
            ]
          };
        }
      }
    }
  }

  return { isValid: true, errors: [] };
}

export async function validateEvaluationParamsForCreate(
  params: EvaluationValidationParams,
  teamId?: string
): Promise<ValidationResult> {
  return validateEvaluationParams(params, { mode: 'create', teamId });
}

export async function validateEvaluationParamsForUpdate(
  params: EvaluationValidationParams,
  teamId?: string
): Promise<ValidationResult> {
  return validateEvaluationParams(params, { mode: 'update', teamId });
}
