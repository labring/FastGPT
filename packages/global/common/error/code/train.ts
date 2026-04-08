import { i18nT } from '../../../../web/i18n/utils';
import { type ErrType } from '../errorCode';

/* train: 502000 */
export enum RerankTrainErrEnum {
  // Trainset errors
  trainsetNotExist = 'trainsetNotExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetInUse = 'trainsetInUse',
  trainsetGenerationFailed = 'trainsetGenerationFailed',

  // Training data errors
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',

  // Training task errors
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',
  taskModelNotFound = 'taskModelNotFound',
  taskBaseModelDisabled = 'taskBaseModelDisabled',
  taskNotCompleted = 'taskNotCompleted',
  tunedModelNotFound = 'tunedModelNotFound',

  // Eval dataset errors
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',
  evalResultsNotFound = 'evalResultsNotFound',

  // External service errors
  ditingServiceError = 'ditingServiceError',
  sftBridgeServiceError = 'sftBridgeServiceError',

  // Environment validation errors
  validationSftBridgeUnaccessible = 'validationSftBridgeUnaccessible',
  validationDitingUnaccessible = 'validationDitingUnaccessible',
  validationDatasetNoSynthesisIndex = 'validationDatasetNoSynthesisIndex',
  validationNoDatasetConfigured = 'validationNoDatasetConfigured',

  // === Preparing Stage Errors ===
  prepareTrainsetDeleted = 'prepareTrainsetDeleted',
  prepareDataEmpty = 'prepareDataEmpty',
  prepareTimeout = 'prepareTimeout',
  prepareFileSystemError = 'prepareFileSystemError',
  prepareDataEmptyAfterWrite = 'prepareDataEmptyAfterWrite',

  // === Finetuning Stage Errors ===
  finetuneDataPathNotFound = 'finetuneDataPathNotFound',
  finetuneModelConfigInvalid = 'finetuneModelConfigInvalid',
  finetuneDataFileNotFound = 'finetuneDataFileNotFound',
  finetuneSftBridgeCreateFailed = 'finetuneSftBridgeCreateFailed',
  finetuneCancelled = 'finetuneCancelled',
  finetuneDeploymentFailed = 'finetuneDeploymentFailed',
  finetuneTrainingFailed = 'finetuneTrainingFailed',
  finetuneTimeout = 'finetuneTimeout',
  finetuneDeploymentNoEndpoint = 'finetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  registerEndpointNotFound = 'registerEndpointNotFound',
  registerBaseModelNotFound = 'registerBaseModelNotFound',
  registerAiProxyFailed = 'registerAiProxyFailed',
  registerChannelNotAvailable = 'registerChannelNotAvailable',

  // === Evaluating Stage Errors ===
  evalNoDatasetConfigured = 'evalNoDatasetConfigured',
  evalNoDataAvailable = 'evalNoDataAvailable',
  evalDitingGenerationFailed = 'evalDitingGenerationFailed',
  evalDatabaseSaveFailed = 'evalDatabaseSaveFailed',
  evalDatasetEmptyBeforeEval = 'evalDatasetEmptyBeforeEval',
  evalDatasetSearchAllFailed = 'evalDatasetSearchAllFailed',
  evalModelNotFound = 'evalModelNotFound',
  evalDitingEvalFailed = 'evalDitingEvalFailed',

  // === Processor Internal Errors ===
  processorTaskNotFound = 'processorTaskNotFound',
  processorTaskLostAfterPrepare = 'processorTaskLostAfterPrepare',
  processorTaskLostAfterFinetune = 'processorTaskLostAfterFinetune',
  processorTaskLostAfterRegister = 'processorTaskLostAfterRegister',
  processorModelConfigNotInCheckpoint = 'processorModelConfigNotInCheckpoint',
  processorTaskLostAfterEvalGen = 'processorTaskLostAfterEvalGen',
  processorTaskLostAfterEval = 'processorTaskLostAfterEval',

  // === Trainset Generation Errors ===
  trainsetGenNoDataset = 'trainsetGenNoDataset',
  trainsetGenDatasetEmpty = 'trainsetGenDatasetEmpty',
  trainsetGenDitingFailed = 'trainsetGenDitingFailed',
  trainsetGenDitingNoData = 'trainsetGenDitingNoData',
  trainsetGenDatabaseError = 'trainsetGenDatabaseError',
  trainsetGenAlreadyGenerating = 'trainsetGenAlreadyGenerating',
  trainsetGenNotFound = 'trainsetGenNotFound',

  // === General Errors ===
  unknownError = 'unknownError'
}

/* embedding: 502100 */
export enum EmbeddingTrainErrEnum {
  // Trainset errors
  trainsetNotExist = 'trainsetNotExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetInUse = 'trainsetInUse',
  trainsetGenerationFailed = 'trainsetGenerationFailed',

  // Training data errors
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',

  // Training task errors
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',
  taskModelNotFound = 'taskModelNotFound',
  taskBaseModelDisabled = 'taskBaseModelDisabled',
  taskNotCompleted = 'taskNotCompleted',
  tunedModelNotFound = 'tunedModelNotFound',

  // Eval dataset errors
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',
  evalResultsNotFound = 'evalResultsNotFound',

  // External service errors
  ditingServiceError = 'ditingServiceError',
  sftBridgeServiceError = 'sftBridgeServiceError',

  // Environment validation errors
  validationSftBridgeUnaccessible = 'validationSftBridgeUnaccessible',
  validationDitingUnaccessible = 'validationDitingUnaccessible',
  validationDatasetNoSynthesisIndex = 'validationDatasetNoSynthesisIndex',
  validationNoDatasetConfigured = 'validationNoDatasetConfigured',

  // === Preparing Stage Errors ===
  prepareTrainsetDeleted = 'prepareTrainsetDeleted',
  prepareDataEmpty = 'prepareDataEmpty',
  prepareTimeout = 'prepareTimeout',
  prepareFileSystemError = 'prepareFileSystemError',
  prepareDataEmptyAfterWrite = 'prepareDataEmptyAfterWrite',

  // === Finetuning Stage Errors ===
  finetuneDataPathNotFound = 'finetuneDataPathNotFound',
  finetuneModelConfigInvalid = 'finetuneModelConfigInvalid',
  finetuneDataFileNotFound = 'finetuneDataFileNotFound',
  finetuneSftBridgeCreateFailed = 'finetuneSftBridgeCreateFailed',
  finetuneCancelled = 'finetuneCancelled',
  finetuneDeploymentFailed = 'finetuneDeploymentFailed',
  finetuneTrainingFailed = 'finetuneTrainingFailed',
  finetuneTimeout = 'finetuneTimeout',
  finetuneDeploymentNoEndpoint = 'finetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  registerEndpointNotFound = 'registerEndpointNotFound',
  registerBaseModelNotFound = 'registerBaseModelNotFound',
  registerAiProxyFailed = 'registerAiProxyFailed',
  registerChannelNotAvailable = 'registerChannelNotAvailable',

  // === Evaluating Stage Errors ===
  evalNoDatasetConfigured = 'evalNoDatasetConfigured',
  evalNoDataAvailable = 'evalNoDataAvailable',
  evalDitingGenerationFailed = 'evalDitingGenerationFailed',
  evalDatabaseSaveFailed = 'evalDatabaseSaveFailed',
  evalDatasetEmptyBeforeEval = 'evalDatasetEmptyBeforeEval',
  evalDatasetSearchAllFailed = 'evalDatasetSearchAllFailed',
  evalModelNotFound = 'evalModelNotFound',
  evalDitingEvalFailed = 'evalDitingEvalFailed',

  // === Processor Internal Errors ===
  processorTaskNotFound = 'processorTaskNotFound',
  processorTaskLostAfterPrepare = 'processorTaskLostAfterPrepare',
  processorTaskLostAfterFinetune = 'processorTaskLostAfterFinetune',
  processorTaskLostAfterRegister = 'processorTaskLostAfterRegister',
  processorModelConfigNotInCheckpoint = 'processorModelConfigNotInCheckpoint',
  processorTaskLostAfterEvalGen = 'processorTaskLostAfterEvalGen',
  processorTaskLostAfterEval = 'processorTaskLostAfterEval',

  // === Trainset Generation Errors ===
  trainsetGenNoDataset = 'trainsetGenNoDataset',
  trainsetGenDatasetEmpty = 'trainsetGenDatasetEmpty',
  trainsetGenDitingFailed = 'trainsetGenDitingFailed',
  trainsetGenDitingNoData = 'trainsetGenDitingNoData',
  trainsetGenDatabaseError = 'trainsetGenDatabaseError',
  trainsetGenAlreadyGenerating = 'trainsetGenAlreadyGenerating',
  trainsetGenNotFound = 'trainsetGenNotFound',

  // === General Errors ===
  unknownError = 'unknownError'
}

/**
 * Suggestion enum for rerank training errors
 * Uses same camelCase naming as RerankTrainErrEnum for consistency
 */
export enum RerankTrainSuggestionEnum {
  // Trainset errors
  trainsetNotExist = 'trainsetNotExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetInUse = 'trainsetInUse',
  trainsetGenerationFailed = 'trainsetGenerationFailed',

  // Training data errors
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',

  // Training task errors
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',
  taskModelNotFound = 'taskModelNotFound',
  taskBaseModelDisabled = 'taskBaseModelDisabled',
  taskNotCompleted = 'taskNotCompleted',
  tunedModelNotFound = 'tunedModelNotFound',

  // Eval dataset errors
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',
  evalResultsNotFound = 'evalResultsNotFound',

  // External service errors
  ditingServiceError = 'ditingServiceError',
  sftBridgeServiceError = 'sftBridgeServiceError',

  // Environment validation errors
  validationSftBridgeUnaccessible = 'validationSftBridgeUnaccessible',
  validationDitingUnaccessible = 'validationDitingUnaccessible',
  validationDatasetNoSynthesisIndex = 'validationDatasetNoSynthesisIndex',
  validationNoDatasetConfigured = 'validationNoDatasetConfigured',

  // === Preparing Stage Errors ===
  prepareTrainsetDeleted = 'prepareTrainsetDeleted',
  prepareDataEmpty = 'prepareDataEmpty',
  prepareTimeout = 'prepareTimeout',
  prepareFileSystemError = 'prepareFileSystemError',
  prepareDataEmptyAfterWrite = 'prepareDataEmptyAfterWrite',

  // === Finetuning Stage Errors ===
  finetuneDataPathNotFound = 'finetuneDataPathNotFound',
  finetuneModelConfigInvalid = 'finetuneModelConfigInvalid',
  finetuneDataFileNotFound = 'finetuneDataFileNotFound',
  finetuneSftBridgeCreateFailed = 'finetuneSftBridgeCreateFailed',
  finetuneCancelled = 'finetuneCancelled',
  finetuneDeploymentFailed = 'finetuneDeploymentFailed',
  finetuneTrainingFailed = 'finetuneTrainingFailed',
  finetuneTimeout = 'finetuneTimeout',
  finetuneDeploymentNoEndpoint = 'finetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  registerEndpointNotFound = 'registerEndpointNotFound',
  registerBaseModelNotFound = 'registerBaseModelNotFound',
  registerAiProxyFailed = 'registerAiProxyFailed',
  registerChannelNotAvailable = 'registerChannelNotAvailable',

  // === Evaluating Stage Errors ===
  evalNoDatasetConfigured = 'evalNoDatasetConfigured',
  evalNoDataAvailable = 'evalNoDataAvailable',
  evalDitingGenerationFailed = 'evalDitingGenerationFailed',
  evalDatabaseSaveFailed = 'evalDatabaseSaveFailed',
  evalDatasetEmptyBeforeEval = 'evalDatasetEmptyBeforeEval',
  evalDatasetSearchAllFailed = 'evalDatasetSearchAllFailed',
  evalModelNotFound = 'evalModelNotFound',
  evalDitingEvalFailed = 'evalDitingEvalFailed',

  // === Processor Internal Errors ===
  processorTaskNotFound = 'processorTaskNotFound',
  processorTaskLostAfterPrepare = 'processorTaskLostAfterPrepare',
  processorTaskLostAfterFinetune = 'processorTaskLostAfterFinetune',
  processorTaskLostAfterRegister = 'processorTaskLostAfterRegister',
  processorModelConfigNotInCheckpoint = 'processorModelConfigNotInCheckpoint',
  processorTaskLostAfterEvalGen = 'processorTaskLostAfterEvalGen',
  processorTaskLostAfterEval = 'processorTaskLostAfterEval',

  // === Trainset Generation Suggestions ===
  trainsetGenNoDataset = 'trainsetGenNoDataset',
  trainsetGenDatasetEmpty = 'trainsetGenDatasetEmpty',
  trainsetGenDitingFailed = 'trainsetGenDitingFailed',
  trainsetGenDitingNoData = 'trainsetGenDitingNoData',
  trainsetGenDatabaseError = 'trainsetGenDatabaseError',
  trainsetGenAlreadyGenerating = 'trainsetGenAlreadyGenerating',
  trainsetGenNotFound = 'trainsetGenNotFound',

  // === General Errors ===
  unknownError = 'unknownError'
}

/**
 * Suggestion enum for embedding training errors
 * Uses same camelCase naming as EmbeddingTrainErrEnum for consistency
 */
export enum EmbeddingTrainSuggestionEnum {
  // Trainset errors
  trainsetNotExist = 'trainsetNotExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetInUse = 'trainsetInUse',
  trainsetGenerationFailed = 'trainsetGenerationFailed',

  // Training data errors
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',

  // Training task errors
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',
  taskModelNotFound = 'taskModelNotFound',
  taskBaseModelDisabled = 'taskBaseModelDisabled',
  taskNotCompleted = 'taskNotCompleted',
  tunedModelNotFound = 'tunedModelNotFound',

  // Eval dataset errors
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',
  evalResultsNotFound = 'evalResultsNotFound',

  // External service errors
  ditingServiceError = 'ditingServiceError',
  sftBridgeServiceError = 'sftBridgeServiceError',

  // Environment validation errors
  validationSftBridgeUnaccessible = 'validationSftBridgeUnaccessible',
  validationDitingUnaccessible = 'validationDitingUnaccessible',
  validationDatasetNoSynthesisIndex = 'validationDatasetNoSynthesisIndex',
  validationNoDatasetConfigured = 'validationNoDatasetConfigured',

  // === Preparing Stage Errors ===
  prepareTrainsetDeleted = 'prepareTrainsetDeleted',
  prepareDataEmpty = 'prepareDataEmpty',
  prepareTimeout = 'prepareTimeout',
  prepareFileSystemError = 'prepareFileSystemError',
  prepareDataEmptyAfterWrite = 'prepareDataEmptyAfterWrite',

  // === Finetuning Stage Errors ===
  finetuneDataPathNotFound = 'finetuneDataPathNotFound',
  finetuneModelConfigInvalid = 'finetuneModelConfigInvalid',
  finetuneDataFileNotFound = 'finetuneDataFileNotFound',
  finetuneSftBridgeCreateFailed = 'finetuneSftBridgeCreateFailed',
  finetuneCancelled = 'finetuneCancelled',
  finetuneDeploymentFailed = 'finetuneDeploymentFailed',
  finetuneTrainingFailed = 'finetuneTrainingFailed',
  finetuneTimeout = 'finetuneTimeout',
  finetuneDeploymentNoEndpoint = 'finetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  registerEndpointNotFound = 'registerEndpointNotFound',
  registerBaseModelNotFound = 'registerBaseModelNotFound',
  registerAiProxyFailed = 'registerAiProxyFailed',
  registerChannelNotAvailable = 'registerChannelNotAvailable',

  // === Evaluating Stage Errors ===
  evalNoDatasetConfigured = 'evalNoDatasetConfigured',
  evalNoDataAvailable = 'evalNoDataAvailable',
  evalDitingGenerationFailed = 'evalDitingGenerationFailed',
  evalDatabaseSaveFailed = 'evalDatabaseSaveFailed',
  evalDatasetEmptyBeforeEval = 'evalDatasetEmptyBeforeEval',
  evalDatasetSearchAllFailed = 'evalDatasetSearchAllFailed',
  evalModelNotFound = 'evalModelNotFound',
  evalDitingEvalFailed = 'evalDitingEvalFailed',

  // === Processor Internal Errors ===
  processorTaskNotFound = 'processorTaskNotFound',
  processorTaskLostAfterPrepare = 'processorTaskLostAfterPrepare',
  processorTaskLostAfterFinetune = 'processorTaskLostAfterFinetune',
  processorTaskLostAfterRegister = 'processorTaskLostAfterRegister',
  processorModelConfigNotInCheckpoint = 'processorModelConfigNotInCheckpoint',
  processorTaskLostAfterEvalGen = 'processorTaskLostAfterEvalGen',
  processorTaskLostAfterEval = 'processorTaskLostAfterEval',

  // === Trainset Generation Suggestions ===
  trainsetGenNoDataset = 'trainsetGenNoDataset',
  trainsetGenDatasetEmpty = 'trainsetGenDatasetEmpty',
  trainsetGenDitingFailed = 'trainsetGenDitingFailed',
  trainsetGenDitingNoData = 'trainsetGenDitingNoData',
  trainsetGenDatabaseError = 'trainsetGenDatabaseError',
  trainsetGenAlreadyGenerating = 'trainsetGenAlreadyGenerating',
  trainsetGenNotFound = 'trainsetGenNotFound',

  // === General Errors ===
  unknownError = 'unknownError'
}

/**
 * Convert RerankTrainErrEnum to i18n message key
 * Example: prepareTrainsetDeleted -> train:prepare_trainset_deleted
 *
 * @param type - Error type from RerankTrainErrEnum
 * @returns i18n key with 'train:' prefix
 */
export function getTrainErrorMessageKey(type: RerankTrainErrEnum): string {
  // Convert camelCase to snake_case
  const snakeCase = type
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}`;
}

/**
 * Convert RerankTrainSuggestionEnum to i18n suggestion key
 * Example: prepareTrainsetDeleted -> train:prepare_trainset_deleted_suggestion
 *
 * @param suggestion - Suggestion enum value
 * @returns i18n key with 'train:' prefix and '_suggestion' suffix
 */
export function getTrainErrorSuggestionKey(suggestion: RerankTrainSuggestionEnum): string {
  // Convert camelCase to snake_case
  const snakeCase = suggestion
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}_suggestion`;
}

/**
 * Convert EmbeddingTrainErrEnum to i18n message key
 * Example: prepareTrainsetDeleted -> train:prepare_trainset_deleted
 *
 * @param type - Error type from EmbeddingTrainErrEnum
 * @returns i18n key with 'train:' prefix
 */
export function getEmbeddingTrainErrorMessageKey(type: EmbeddingTrainErrEnum): string {
  // Convert camelCase to snake_case
  const snakeCase = type
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}`;
}

/**
 * Convert EmbeddingTrainSuggestionEnum to i18n suggestion key
 * Example: prepareTrainsetDeleted -> train:prepare_trainset_deleted_suggestion
 *
 * @param suggestion - Suggestion enum value
 * @returns i18n key with 'train:' prefix and '_suggestion' suffix
 */
export function getEmbeddingTrainErrorSuggestionKey(
  suggestion: EmbeddingTrainSuggestionEnum
): string {
  // Convert camelCase to snake_case
  const snakeCase = suggestion
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}_suggestion`;
}

/**
 * Auto-generate trainErr array using enum values for Rerank
 * This ensures consistency and reduces manual duplication
 */
const trainErr = Object.values(RerankTrainErrEnum).map((errType) => ({
  statusText: errType,
  message: i18nT(getTrainErrorMessageKey(errType) as any)
}));

/**
 * Auto-generate embeddingTrainErr array using enum values for Embedding
 * This ensures consistency and reduces manual duplication
 */
const embeddingTrainErr = Object.values(EmbeddingTrainErrEnum).map((errType) => ({
  statusText: errType,
  message: i18nT(getEmbeddingTrainErrorMessageKey(errType) as any)
}));

const rerankTrainErrorCodes = trainErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${RerankTrainErrEnum}`>);

const embeddingTrainErrorCodes = embeddingTrainErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502100 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${EmbeddingTrainErrEnum}`>);

export default { ...rerankTrainErrorCodes, ...embeddingTrainErrorCodes };
