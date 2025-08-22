export interface ValidationResult {
  success: boolean;
  message?: string;
}

export interface EvaluationValidationParams {
  name?: string;
  description?: string;
}

export interface EvaluationValidationOptions {
  namePrefix?: string; // e.g., 'Dataset', 'Metric', 'Evaluation'
}

export function validateEvaluationParams(
  params: EvaluationValidationParams,
  options: EvaluationValidationOptions = {}
): ValidationResult {
  const { name, description } = params;
  const { namePrefix = 'Name' } = options;

  if (name !== undefined) {
    if (!name || !name.trim()) {
      return {
        success: false,
        message: `${namePrefix} name is required`
      };
    }

    if (name.length > 100) {
      return {
        success: false,
        message: `${namePrefix} name cannot exceed 100 characters`
      };
    }
  }

  if (description !== undefined && description && description.length > 100) {
    return {
      success: false,
      message: 'Description cannot exceed 100 characters'
    };
  }

  return { success: true };
}
