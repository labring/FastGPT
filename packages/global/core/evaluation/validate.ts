// Validation error structure
export interface ValidationError {
  code: string; // Error code for programmatic handling
  message: string; // Human-readable error message
  field?: string; // Field name that caused the error (optional)
  debugInfo?: Record<string, any>; // Additional debug information
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[]; // Optional warnings that don't prevent usage
}

// Base abstract class for all validatable objects
export abstract class Validatable {
  /**
   * Validate this object and return detailed validation result
   */
  abstract validate(): Promise<ValidationResult>;

  /**
   * Convenience method to check if this object is valid
   */
  async isValid(): Promise<boolean> {
    const result = await this.validate();
    return result.isValid;
  }

  /**
   * Convenience method to get validation error messages
   */
  async getValidationErrors(): Promise<ValidationError[]> {
    const result = await this.validate();
    return result.errors;
  }
}

// Utility functions for ValidationResult
export const ValidationResultUtils = {
  /**
   * Format validation errors into a readable string
   */
  formatErrors(result: ValidationResult, separator = '; '): string {
    return (result.errors || []).map((err) => `${err.code}: ${err.message}`).join(separator);
  },

  /**
   * Format validation warnings into a readable string
   */
  formatWarnings(result: ValidationResult, separator = '; '): string {
    return result.warnings?.map((err) => `${err.code}: ${err.message}`).join(separator) || '';
  },

  /**
   * Get a summary message for validation result
   */
  getSummaryMessage(result: ValidationResult): string {
    if (result.isValid) {
      const warningMsg = result.warnings?.length ? ` (${result.warnings.length} warnings)` : '';
      return `Validation passed${warningMsg}`;
    } else {
      return `Validation failed: ${ValidationResultUtils.formatErrors(result)}`;
    }
  },

  /**
   * Create an Error object from ValidationResult
   */
  toError(result: ValidationResult): Error {
    if (result.isValid) {
      throw new Error('Cannot create error from valid validation result');
    }
    return new Error(ValidationResultUtils.formatErrors(result));
  }
};
