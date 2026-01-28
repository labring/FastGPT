import { i18nT } from '../../../../web/i18n/utils';
import { type ErrType } from '../errorCode';

/* train: 502000 */
export enum RerankTrainErrEnum {
  // 应用训练集错误
  trainsetNotExist = 'trainsetNotExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetAlreadyReady = 'trainsetAlreadyReady',
  trainsetNotReady = 'trainsetNotReady',
  trainsetInUse = 'trainsetInUse',
  trainsetGenerationFailed = 'trainsetGenerationFailed',

  // 训练数据错误
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',
  noDatasetAvailable = 'noDatasetAvailable',

  // 训练任务错误
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',
  taskAppNotFound = 'taskAppNotFound',
  taskModelNotFound = 'taskModelNotFound',

  // 评测数据集错误
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',
  evalResultsNotFound = 'evalResultsNotFound',

  // 外部服务错误
  ditingServiceError = 'ditingServiceError',
  sftBridgeServiceError = 'sftBridgeServiceError',

  // 环境验证错误
  validationSftBridgeUnaccessible = 'validationSftBridgeUnaccessible',
  validationDitingUnaccessible = 'validationDitingUnaccessible',
  validationDatasetNoSynthesisIndex = 'validationDatasetNoSynthesisIndex',
  validationNoDatasetConfigured = 'validationNoDatasetConfigured',

  // === 准备阶段错误 (Preparing Stage) ===
  prepareTrainsetDeleted = 'prepareTrainsetDeleted',
  prepareDataEmpty = 'prepareDataEmpty',
  prepareGenerationFailed = 'prepareGenerationFailed',
  prepareTimeout = 'prepareTimeout',
  prepareFileSystemError = 'prepareFileSystemError',
  prepareDataEmptyAfterWrite = 'prepareDataEmptyAfterWrite',

  // === 微调阶段错误 (Finetuning Stage) ===
  finetuneDataPathNotFound = 'finetuneDataPathNotFound',
  finetuneModelConfigInvalid = 'finetuneModelConfigInvalid',
  finetuneDataFileNotFound = 'finetuneDataFileNotFound',
  finetuneSftBridgeCreateFailed = 'finetuneSftBridgeCreateFailed',
  finetuneCancelled = 'finetuneCancelled',
  finetuneDeploymentFailed = 'finetuneDeploymentFailed',
  finetuneTrainingFailed = 'finetuneTrainingFailed',
  finetuneTimeout = 'finetuneTimeout',
  finetuneDeploymentNoEndpoint = 'finetuneDeploymentNoEndpoint',

  // === 注册阶段错误 (Registering Stage) ===
  registerEndpointNotFound = 'registerEndpointNotFound',
  registerBaseModelNotFound = 'registerBaseModelNotFound',
  registerAiProxyFailed = 'registerAiProxyFailed',
  registerChannelNotAvailable = 'registerChannelNotAvailable',

  // === 评估阶段错误 (Evaluating Stage) ===
  evalAppDeleted = 'evalAppDeleted',
  evalNoDatasetConfigured = 'evalNoDatasetConfigured',
  evalNoDataAvailable = 'evalNoDataAvailable',
  evalDitingGenerationFailed = 'evalDitingGenerationFailed',
  evalDatabaseSaveFailed = 'evalDatabaseSaveFailed',
  evalDatasetEmptyBeforeEval = 'evalDatasetEmptyBeforeEval',
  evalModelNotFound = 'evalModelNotFound',
  evalDitingEvalFailed = 'evalDitingEvalFailed',

  // === 应用阶段错误 (Applying Stage) ===
  applyModelConfigNotFound = 'applyModelConfigNotFound',
  applyAppDeleted = 'applyAppDeleted',
  applyNoNodesToUpdate = 'applyNoNodesToUpdate',
  applyDatabaseUpdateFailed = 'applyDatabaseUpdateFailed',

  // === 处理器内部错误 (Processor Internal Errors) ===
  processorTaskNotFound = 'processorTaskNotFound',
  processorTaskLostAfterPrepare = 'processorTaskLostAfterPrepare',
  processorTaskLostAfterFinetune = 'processorTaskLostAfterFinetune',
  processorTaskLostAfterRegister = 'processorTaskLostAfterRegister',
  processorModelConfigNotInCheckpoint = 'processorModelConfigNotInCheckpoint',
  processorTaskLostAfterEvalGen = 'processorTaskLostAfterEvalGen',
  processorTaskLostAfterEval = 'processorTaskLostAfterEval',
  processorTaskLostAfterApply = 'processorTaskLostAfterApply',

  // === 训练集生成错误 (Trainset Generation Errors) ===
  trainsetGenAppDeleted = 'trainsetGenAppDeleted',
  trainsetGenNoDataset = 'trainsetGenNoDataset',
  trainsetGenDatasetEmpty = 'trainsetGenDatasetEmpty',
  trainsetGenDitingFailed = 'trainsetGenDitingFailed',
  trainsetGenDitingNoData = 'trainsetGenDitingNoData',
  trainsetGenDatabaseError = 'trainsetGenDatabaseError',
  trainsetGenAlreadyGenerating = 'trainsetGenAlreadyGenerating',
  trainsetGenNotFound = 'trainsetGenNotFound',
  trainsetGenCancelled = 'trainsetGenCancelled',

  // === 通用错误 (General Errors) ===
  unknownError = 'unknownError'
}

/**
 * Suggestion enum for rerank training errors
 * Uses same camelCase naming as RerankTrainErrEnum for consistency
 */
export enum RerankTrainSuggestionEnum {
  // 应用训练集错误
  trainsetNotExist = 'trainsetNotExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetAlreadyReady = 'trainsetAlreadyReady',
  trainsetNotReady = 'trainsetNotReady',
  trainsetInUse = 'trainsetInUse',
  trainsetGenerationFailed = 'trainsetGenerationFailed',

  // 训练数据错误
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',
  noDatasetAvailable = 'noDatasetAvailable',

  // 训练任务错误
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',
  taskAppNotFound = 'taskAppNotFound',
  taskModelNotFound = 'taskModelNotFound',

  // 评测数据集错误
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',
  evalResultsNotFound = 'evalResultsNotFound',

  // 外部服务错误
  ditingServiceError = 'ditingServiceError',
  sftBridgeServiceError = 'sftBridgeServiceError',

  // 环境验证错误
  validationSftBridgeUnaccessible = 'validationSftBridgeUnaccessible',
  validationDitingUnaccessible = 'validationDitingUnaccessible',
  validationDatasetNoSynthesisIndex = 'validationDatasetNoSynthesisIndex',
  validationNoDatasetConfigured = 'validationNoDatasetConfigured',

  // === 准备阶段错误 ===
  prepareTrainsetDeleted = 'prepareTrainsetDeleted',
  prepareDataEmpty = 'prepareDataEmpty',
  prepareGenerationFailed = 'prepareGenerationFailed',
  prepareTimeout = 'prepareTimeout',
  prepareFileSystemError = 'prepareFileSystemError',
  prepareDataEmptyAfterWrite = 'prepareDataEmptyAfterWrite',

  // === 微调阶段错误 ===
  finetuneDataPathNotFound = 'finetuneDataPathNotFound',
  finetuneModelConfigInvalid = 'finetuneModelConfigInvalid',
  finetuneDataFileNotFound = 'finetuneDataFileNotFound',
  finetuneSftBridgeCreateFailed = 'finetuneSftBridgeCreateFailed',
  finetuneCancelled = 'finetuneCancelled',
  finetuneDeploymentFailed = 'finetuneDeploymentFailed',
  finetuneTrainingFailed = 'finetuneTrainingFailed',
  finetuneTimeout = 'finetuneTimeout',
  finetuneDeploymentNoEndpoint = 'finetuneDeploymentNoEndpoint',

  // === 注册阶段错误 ===
  registerEndpointNotFound = 'registerEndpointNotFound',
  registerBaseModelNotFound = 'registerBaseModelNotFound',
  registerAiProxyFailed = 'registerAiProxyFailed',
  registerChannelNotAvailable = 'registerChannelNotAvailable',

  // === 评估阶段错误 ===
  evalAppDeleted = 'evalAppDeleted',
  evalNoDatasetConfigured = 'evalNoDatasetConfigured',
  evalNoDataAvailable = 'evalNoDataAvailable',
  evalDitingGenerationFailed = 'evalDitingGenerationFailed',
  evalDatabaseSaveFailed = 'evalDatabaseSaveFailed',
  evalDatasetEmptyBeforeEval = 'evalDatasetEmptyBeforeEval',
  evalModelNotFound = 'evalModelNotFound',
  evalDitingEvalFailed = 'evalDitingEvalFailed',

  // === 应用阶段错误 ===
  applyModelConfigNotFound = 'applyModelConfigNotFound',
  applyAppDeleted = 'applyAppDeleted',
  applyNoNodesToUpdate = 'applyNoNodesToUpdate',
  applyDatabaseUpdateFailed = 'applyDatabaseUpdateFailed',

  // === 处理器内部错误 ===
  processorTaskNotFound = 'processorTaskNotFound',
  processorTaskLostAfterPrepare = 'processorTaskLostAfterPrepare',
  processorTaskLostAfterFinetune = 'processorTaskLostAfterFinetune',
  processorTaskLostAfterRegister = 'processorTaskLostAfterRegister',
  processorModelConfigNotInCheckpoint = 'processorModelConfigNotInCheckpoint',
  processorTaskLostAfterEvalGen = 'processorTaskLostAfterEvalGen',
  processorTaskLostAfterEval = 'processorTaskLostAfterEval',
  processorTaskLostAfterApply = 'processorTaskLostAfterApply',

  // === 训练集生成建议 ===
  trainsetGenAppDeleted = 'trainsetGenAppDeleted',
  trainsetGenNoDataset = 'trainsetGenNoDataset',
  trainsetGenDatasetEmpty = 'trainsetGenDatasetEmpty',
  trainsetGenDitingFailed = 'trainsetGenDitingFailed',
  trainsetGenDitingNoData = 'trainsetGenDitingNoData',
  trainsetGenDatabaseError = 'trainsetGenDatabaseError',
  trainsetGenAlreadyGenerating = 'trainsetGenAlreadyGenerating',
  trainsetGenNotFound = 'trainsetGenNotFound',
  trainsetGenCancelled = 'trainsetGenCancelled',

  // === 通用错误 ===
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
 * Auto-generate trainErr array using enum values
 * This ensures consistency and reduces manual duplication
 */
const trainErr = Object.values(RerankTrainErrEnum).map((errType) => ({
  statusText: errType,
  message: i18nT(getTrainErrorMessageKey(errType) as any)
}));

export default trainErr.reduce((acc, cur, index) => {
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
