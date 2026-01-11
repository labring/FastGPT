import type { RerankTaskCheckpointStageEnum } from './constants';

/**
 * Train task error type enumeration
 */
export enum TrainTaskErrorType {
  // Data-related errors
  DATA_EMPTY = 'Insufficient Data',
  DATA_INVALID = 'Invalid Data Format',
  DATA_GENERATION_FAILED = 'Data Generation Failed',
  DATA_FILE_NOT_FOUND = 'Data File Not Found',

  // Model-related errors
  MODEL_NOT_FOUND = 'Model Not Found',
  MODEL_CONFIG_INVALID = 'Invalid Model Configuration',
  MODEL_TRAINING_FAILED = 'Model Training Failed',
  MODEL_REGISTRATION_FAILED = 'Model Registration Failed',
  MODEL_DEPLOYMENT_FAILED = 'Model Deployment Failed',

  // Service-related errors
  SERVICE_UNAVAILABLE = 'External Service Unavailable',
  SERVICE_TIMEOUT = 'External Service Timeout',
  SERVICE_API_ERROR = 'External Service API Error',

  // Evaluation-related errors
  EVAL_DATASET_EMPTY = 'Evaluation Dataset Empty',
  EVAL_FAILED = 'Evaluation Failed',

  // App update-related errors
  APP_VERSION_CREATE_FAILED = 'App Version Creation Failed',
  APP_UPDATE_FAILED = 'App Update Failed',

  // System-related errors
  TIMEOUT = 'Operation Timeout',
  CANCELLED = 'Task Cancelled',
  INTERNAL_ERROR = 'Internal Error',
  UNKNOWN_ERROR = 'Unknown Error',
  DATABASE_ERROR = 'Database Error',
  FILE_SYSTEM_ERROR = 'File System Error'
}

/**
 * Enhanced error message for training tasks
 *
 * Contains structured error information including stage, type, message, suggestion and original error.
 * This format allows frontend to display rich error information to users.
 */
export interface EnhancedErrorMessage {
  /** Error stage (which stage the error occurred in) */
  stage: `${RerankTaskCheckpointStageEnum}` | null;
  /** Error type (categorized error type) */
  type: `${TrainTaskErrorType}` | string;
  /** Detailed error message */
  message: string;
  /** Resolution suggestion (how to fix the error) */
  suggestion?: string;
  /** Original error message (for debugging) */
  originalError?: string;
}
