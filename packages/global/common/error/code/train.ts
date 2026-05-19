import { i18nT } from '../../i18n/utils';
import { type ErrType } from '../errorCode';

/* train: 502000 */
export enum RerankTrainErrEnum {
  // Trainset errors
  rerankTrainsetNotExist = 'rerankTrainsetNotExist',
  rerankTrainsetGenerating = 'rerankTrainsetGenerating',
  rerankTrainsetInUse = 'rerankTrainsetInUse',
  rerankTrainsetGenerationFailed = 'rerankTrainsetGenerationFailed',

  // Training data errors
  rerankTrainDataNotExist = 'rerankTrainDataNotExist',
  rerankNoTrainDataAvailable = 'rerankNoTrainDataAvailable',

  // Training task errors
  rerankTaskNotExist = 'rerankTaskNotExist',
  rerankTaskAlreadyRunning = 'rerankTaskAlreadyRunning',
  rerankTaskCannotRetry = 'rerankTaskCannotRetry',
  rerankTaskCannotCancel = 'rerankTaskCannotCancel',
  rerankTaskCannotDelete = 'rerankTaskCannotDelete',
  rerankTaskModelNotFound = 'rerankTaskModelNotFound',
  rerankTaskBaseModelDisabled = 'rerankTaskBaseModelDisabled',
  rerankTaskNotCompleted = 'rerankTaskNotCompleted',
  rerankTunedModelNotFound = 'rerankTunedModelNotFound',
  rerankTaskInsufficientChunks = 'rerankTaskInsufficientChunks',

  // Eval dataset errors
  rerankEvalDatasetNotGenerated = 'rerankEvalDatasetNotGenerated',
  rerankEvalDatasetEmpty = 'rerankEvalDatasetEmpty',
  rerankEvalResultsNotFound = 'rerankEvalResultsNotFound',

  // External service errors
  rerankDitingServiceError = 'rerankDitingServiceError',
  rerankSftBridgeServiceError = 'rerankSftBridgeServiceError',

  // Environment validation errors
  rerankValidationSftBridgeUnaccessible = 'rerankValidationSftBridgeUnaccessible',
  rerankValidationDitingUnaccessible = 'rerankValidationDitingUnaccessible',
  rerankValidationDatasetNoSynthesisIndex = 'rerankValidationDatasetNoSynthesisIndex',
  rerankValidationNoDatasetConfigured = 'rerankValidationNoDatasetConfigured',
  rerankValidationBaseModelNotConfigured = 'rerankValidationBaseModelNotConfigured',

  // === Preparing Stage Errors ===
  rerankPrepareTrainsetDeleted = 'rerankPrepareTrainsetDeleted',
  rerankPrepareDataEmpty = 'rerankPrepareDataEmpty',
  rerankPrepareTimeout = 'rerankPrepareTimeout',
  rerankPrepareFileSystemError = 'rerankPrepareFileSystemError',
  rerankPrepareDataEmptyAfterWrite = 'rerankPrepareDataEmptyAfterWrite',
  rerankPrepareMissingGenerateConfig = 'rerankPrepareMissingGenerateConfig',

  // === Finetuning Stage Errors ===
  rerankFinetuneDataPathNotFound = 'rerankFinetuneDataPathNotFound',
  rerankFinetuneModelConfigInvalid = 'rerankFinetuneModelConfigInvalid',
  rerankFinetuneDataFileNotFound = 'rerankFinetuneDataFileNotFound',
  rerankFinetuneSftBridgeCreateFailed = 'rerankFinetuneSftBridgeCreateFailed',
  rerankFinetuneQueueFull = 'rerankFinetuneQueueFull',
  rerankFinetuneCancelled = 'rerankFinetuneCancelled',
  rerankFinetuneDeploymentFailed = 'rerankFinetuneDeploymentFailed',
  rerankFinetuneTrainingFailed = 'rerankFinetuneTrainingFailed',
  rerankFinetuneTimeout = 'rerankFinetuneTimeout',
  rerankFinetuneDeploymentNoEndpoint = 'rerankFinetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  rerankRegisterEndpointNotFound = 'rerankRegisterEndpointNotFound',
  rerankRegisterBaseModelNotFound = 'rerankRegisterBaseModelNotFound',
  rerankRegisterAiProxyFailed = 'rerankRegisterAiProxyFailed',
  rerankRegisterChannelNotAvailable = 'rerankRegisterChannelNotAvailable',

  // === Evaluating Stage Errors ===
  rerankEvalNoDatasetConfigured = 'rerankEvalNoDatasetConfigured',
  rerankEvalNoDataAvailable = 'rerankEvalNoDataAvailable',
  rerankEvalDitingGenerationFailed = 'rerankEvalDitingGenerationFailed',
  rerankEvalDatabaseSaveFailed = 'rerankEvalDatabaseSaveFailed',
  rerankEvalDatasetEmptyBeforeEval = 'rerankEvalDatasetEmptyBeforeEval',
  rerankEvalDatasetSearchAllFailed = 'rerankEvalDatasetSearchAllFailed',
  rerankEvalModelNotFound = 'rerankEvalModelNotFound',
  rerankEvalDitingEvalFailed = 'rerankEvalDitingEvalFailed',

  // === Processor Internal Errors ===
  rerankProcessorTaskNotFound = 'rerankProcessorTaskNotFound',
  rerankProcessorTaskLostAfterPrepare = 'rerankProcessorTaskLostAfterPrepare',
  rerankProcessorTaskLostAfterFinetune = 'rerankProcessorTaskLostAfterFinetune',
  rerankProcessorTaskLostAfterRegister = 'rerankProcessorTaskLostAfterRegister',
  rerankProcessorModelConfigNotInCheckpoint = 'rerankProcessorModelConfigNotInCheckpoint',
  rerankProcessorTaskLostAfterEvalGen = 'rerankProcessorTaskLostAfterEvalGen',
  rerankProcessorTaskLostAfterEval = 'rerankProcessorTaskLostAfterEval',

  // === Trainset Generation Errors ===
  rerankTrainsetGenNoDataset = 'rerankTrainsetGenNoDataset',
  rerankTrainsetGenDatasetEmpty = 'rerankTrainsetGenDatasetEmpty',
  rerankTrainsetGenInsufficientChunks = 'rerankTrainsetGenInsufficientChunks',
  rerankTrainsetGenDitingFailed = 'rerankTrainsetGenDitingFailed',
  rerankTrainsetGenDitingNoData = 'rerankTrainsetGenDitingNoData',
  rerankTrainsetGenDatabaseError = 'rerankTrainsetGenDatabaseError',
  rerankTrainsetGenAlreadyGenerating = 'rerankTrainsetGenAlreadyGenerating',
  rerankTrainsetGenNotFound = 'rerankTrainsetGenNotFound',

  // === LLM Judge Stage Errors ===
  rerankLLMJudgeNoEvalData = 'rerankLLMJudgeNoEvalData',
  rerankLLMJudgeNoRankingResults = 'rerankLLMJudgeNoRankingResults',
  rerankLLMJudgeDiTingFailed = 'rerankLLMJudgeDiTingFailed',
  rerankLLMJudgeEmptyResult = 'rerankLLMJudgeEmptyResult',

  // === General Errors ===
  rerankUnknownError = 'rerankUnknownError'
}

/* embedding: 502100 */
export enum EmbeddingTrainErrEnum {
  // Trainset errors
  embeddingTrainsetNotExist = 'embeddingTrainsetNotExist',
  embeddingTrainsetGenerating = 'embeddingTrainsetGenerating',
  embeddingTrainsetInUse = 'embeddingTrainsetInUse',
  embeddingTrainsetGenerationFailed = 'embeddingTrainsetGenerationFailed',

  // Training data errors
  embeddingTrainDataNotExist = 'embeddingTrainDataNotExist',
  embeddingNoTrainDataAvailable = 'embeddingNoTrainDataAvailable',

  // Training task errors
  embeddingTaskNotExist = 'embeddingTaskNotExist',
  embeddingTaskAlreadyRunning = 'embeddingTaskAlreadyRunning',
  embeddingTaskCannotRetry = 'embeddingTaskCannotRetry',
  embeddingTaskCannotCancel = 'embeddingTaskCannotCancel',
  embeddingTaskCannotDelete = 'embeddingTaskCannotDelete',
  embeddingTaskModelNotFound = 'embeddingTaskModelNotFound',
  embeddingTaskBaseModelDisabled = 'embeddingTaskBaseModelDisabled',
  embeddingTaskNotCompleted = 'embeddingTaskNotCompleted',
  embeddingTunedModelNotFound = 'embeddingTunedModelNotFound',
  embeddingTaskInsufficientChunks = 'embeddingTaskInsufficientChunks',

  // Eval dataset errors
  embeddingEvalDatasetNotGenerated = 'embeddingEvalDatasetNotGenerated',
  embeddingEvalDatasetEmpty = 'embeddingEvalDatasetEmpty',
  embeddingEvalResultsNotFound = 'embeddingEvalResultsNotFound',

  // External service errors
  embeddingDitingServiceError = 'embeddingDitingServiceError',
  embeddingSftBridgeServiceError = 'embeddingSftBridgeServiceError',

  // Environment validation errors
  embeddingValidationSftBridgeUnaccessible = 'embeddingValidationSftBridgeUnaccessible',
  embeddingValidationDitingUnaccessible = 'embeddingValidationDitingUnaccessible',
  embeddingValidationDatasetNoSynthesisIndex = 'embeddingValidationDatasetNoSynthesisIndex',
  embeddingValidationNoDatasetConfigured = 'embeddingValidationNoDatasetConfigured',
  embeddingValidationBaseModelNotConfigured = 'embeddingValidationBaseModelNotConfigured',

  // === Preparing Stage Errors ===
  embeddingPrepareTrainsetDeleted = 'embeddingPrepareTrainsetDeleted',
  embeddingPrepareDataEmpty = 'embeddingPrepareDataEmpty',
  embeddingPrepareTimeout = 'embeddingPrepareTimeout',
  embeddingPrepareFileSystemError = 'embeddingPrepareFileSystemError',
  embeddingPrepareDataEmptyAfterWrite = 'embeddingPrepareDataEmptyAfterWrite',
  embeddingPrepareMissingGenerateConfig = 'embeddingPrepareMissingGenerateConfig',

  // === Finetuning Stage Errors ===
  embeddingFinetuneDataPathNotFound = 'embeddingFinetuneDataPathNotFound',
  embeddingFinetuneModelConfigInvalid = 'embeddingFinetuneModelConfigInvalid',
  embeddingFinetuneDataFileNotFound = 'embeddingFinetuneDataFileNotFound',
  embeddingFinetuneSftBridgeCreateFailed = 'embeddingFinetuneSftBridgeCreateFailed',
  embeddingFinetuneQueueFull = 'embeddingFinetuneQueueFull',
  embeddingFinetuneCancelled = 'embeddingFinetuneCancelled',
  embeddingFinetuneDeploymentFailed = 'embeddingFinetuneDeploymentFailed',
  embeddingFinetuneTrainingFailed = 'embeddingFinetuneTrainingFailed',
  embeddingFinetuneTimeout = 'embeddingFinetuneTimeout',
  embeddingFinetuneDeploymentNoEndpoint = 'embeddingFinetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  embeddingRegisterEndpointNotFound = 'embeddingRegisterEndpointNotFound',
  embeddingRegisterBaseModelNotFound = 'embeddingRegisterBaseModelNotFound',
  embeddingRegisterAiProxyFailed = 'embeddingRegisterAiProxyFailed',
  embeddingRegisterChannelNotAvailable = 'embeddingRegisterChannelNotAvailable',

  // === Evaluating Stage Errors ===
  embeddingEvalNoDatasetConfigured = 'embeddingEvalNoDatasetConfigured',
  embeddingEvalNoDataAvailable = 'embeddingEvalNoDataAvailable',
  embeddingEvalDitingGenerationFailed = 'embeddingEvalDitingGenerationFailed',
  embeddingEvalDatabaseSaveFailed = 'embeddingEvalDatabaseSaveFailed',
  embeddingEvalDatasetEmptyBeforeEval = 'embeddingEvalDatasetEmptyBeforeEval',
  embeddingEvalDatasetSearchAllFailed = 'embeddingEvalDatasetSearchAllFailed',
  embeddingEvalModelNotFound = 'embeddingEvalModelNotFound',
  embeddingEvalDitingEvalFailed = 'embeddingEvalDitingEvalFailed',

  // === Processor Internal Errors ===
  embeddingProcessorTaskNotFound = 'embeddingProcessorTaskNotFound',
  embeddingProcessorTaskLostAfterPrepare = 'embeddingProcessorTaskLostAfterPrepare',
  embeddingProcessorTaskLostAfterFinetune = 'embeddingProcessorTaskLostAfterFinetune',
  embeddingProcessorTaskLostAfterRegister = 'embeddingProcessorTaskLostAfterRegister',
  embeddingProcessorModelConfigNotInCheckpoint = 'embeddingProcessorModelConfigNotInCheckpoint',
  embeddingProcessorTaskLostAfterEvalGen = 'embeddingProcessorTaskLostAfterEvalGen',
  embeddingProcessorTaskLostAfterEval = 'embeddingProcessorTaskLostAfterEval',

  // === Trainset Generation Errors ===
  embeddingTrainsetGenNoDataset = 'embeddingTrainsetGenNoDataset',
  embeddingTrainsetGenDatasetEmpty = 'embeddingTrainsetGenDatasetEmpty',
  embeddingTrainsetGenInsufficientChunks = 'embeddingTrainsetGenInsufficientChunks',
  embeddingTrainsetGenDitingFailed = 'embeddingTrainsetGenDitingFailed',
  embeddingTrainsetGenDitingNoData = 'embeddingTrainsetGenDitingNoData',
  embeddingTrainsetGenDatabaseError = 'embeddingTrainsetGenDatabaseError',
  embeddingTrainsetGenAlreadyGenerating = 'embeddingTrainsetGenAlreadyGenerating',
  embeddingTrainsetGenNotFound = 'embeddingTrainsetGenNotFound',

  // === LLM Judge Stage Errors ===
  embeddingLLMJudgeNoEvalData = 'embeddingLLMJudgeNoEvalData',
  embeddingLLMJudgeNoRankingResults = 'embeddingLLMJudgeNoRankingResults',
  embeddingLLMJudgeDiTingFailed = 'embeddingLLMJudgeDiTingFailed',
  embeddingLLMJudgeEmptyResult = 'embeddingLLMJudgeEmptyResult',

  // === General Errors ===
  embeddingUnknownError = 'embeddingUnknownError'
}

/**
 * Suggestion enum for rerank training errors
 * Uses same naming pattern as RerankTrainErrEnum for consistency
 */
export enum RerankTrainSuggestionEnum {
  // Trainset errors
  rerankTrainsetNotExist = 'rerankTrainsetNotExist',
  rerankTrainsetGenerating = 'rerankTrainsetGenerating',
  rerankTrainsetInUse = 'rerankTrainsetInUse',
  rerankTrainsetGenerationFailed = 'rerankTrainsetGenerationFailed',

  // Training data errors
  rerankTrainDataNotExist = 'rerankTrainDataNotExist',
  rerankNoTrainDataAvailable = 'rerankNoTrainDataAvailable',

  // Training task errors
  rerankTaskNotExist = 'rerankTaskNotExist',
  rerankTaskAlreadyRunning = 'rerankTaskAlreadyRunning',
  rerankTaskCannotRetry = 'rerankTaskCannotRetry',
  rerankTaskCannotCancel = 'rerankTaskCannotCancel',
  rerankTaskCannotDelete = 'rerankTaskCannotDelete',
  rerankTaskModelNotFound = 'rerankTaskModelNotFound',
  rerankTaskBaseModelDisabled = 'rerankTaskBaseModelDisabled',
  rerankTaskNotCompleted = 'rerankTaskNotCompleted',
  rerankTunedModelNotFound = 'rerankTunedModelNotFound',

  // Eval dataset errors
  rerankEvalDatasetNotGenerated = 'rerankEvalDatasetNotGenerated',
  rerankEvalDatasetEmpty = 'rerankEvalDatasetEmpty',
  rerankEvalResultsNotFound = 'rerankEvalResultsNotFound',

  // External service errors
  rerankDitingServiceError = 'rerankDitingServiceError',
  rerankSftBridgeServiceError = 'rerankSftBridgeServiceError',

  // Environment validation errors
  rerankValidationSftBridgeUnaccessible = 'rerankValidationSftBridgeUnaccessible',
  rerankValidationDitingUnaccessible = 'rerankValidationDitingUnaccessible',
  rerankValidationDatasetNoSynthesisIndex = 'rerankValidationDatasetNoSynthesisIndex',
  rerankValidationNoDatasetConfigured = 'rerankValidationNoDatasetConfigured',
  rerankValidationBaseModelNotConfigured = 'rerankValidationBaseModelNotConfigured',

  // === Preparing Stage Errors ===
  rerankPrepareTrainsetDeleted = 'rerankPrepareTrainsetDeleted',
  rerankPrepareDataEmpty = 'rerankPrepareDataEmpty',
  rerankPrepareTimeout = 'rerankPrepareTimeout',
  rerankPrepareFileSystemError = 'rerankPrepareFileSystemError',
  rerankPrepareDataEmptyAfterWrite = 'rerankPrepareDataEmptyAfterWrite',
  rerankPrepareMissingGenerateConfig = 'rerankPrepareMissingGenerateConfig',

  // === Finetuning Stage Errors ===
  rerankFinetuneDataPathNotFound = 'rerankFinetuneDataPathNotFound',
  rerankFinetuneModelConfigInvalid = 'rerankFinetuneModelConfigInvalid',
  rerankFinetuneDataFileNotFound = 'rerankFinetuneDataFileNotFound',
  rerankFinetuneSftBridgeCreateFailed = 'rerankFinetuneSftBridgeCreateFailed',
  rerankFinetuneQueueFull = 'rerankFinetuneQueueFull',
  rerankFinetuneCancelled = 'rerankFinetuneCancelled',
  rerankFinetuneDeploymentFailed = 'rerankFinetuneDeploymentFailed',
  rerankFinetuneTrainingFailed = 'rerankFinetuneTrainingFailed',
  rerankFinetuneTimeout = 'rerankFinetuneTimeout',
  rerankFinetuneDeploymentNoEndpoint = 'rerankFinetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  rerankRegisterEndpointNotFound = 'rerankRegisterEndpointNotFound',
  rerankRegisterBaseModelNotFound = 'rerankRegisterBaseModelNotFound',
  rerankRegisterAiProxyFailed = 'rerankRegisterAiProxyFailed',
  rerankRegisterChannelNotAvailable = 'rerankRegisterChannelNotAvailable',

  // === Evaluating Stage Errors ===
  rerankEvalNoDatasetConfigured = 'rerankEvalNoDatasetConfigured',
  rerankEvalNoDataAvailable = 'rerankEvalNoDataAvailable',
  rerankEvalDitingGenerationFailed = 'rerankEvalDitingGenerationFailed',
  rerankEvalDatabaseSaveFailed = 'rerankEvalDatabaseSaveFailed',
  rerankEvalDatasetEmptyBeforeEval = 'rerankEvalDatasetEmptyBeforeEval',
  rerankEvalDatasetSearchAllFailed = 'rerankEvalDatasetSearchAllFailed',
  rerankEvalModelNotFound = 'rerankEvalModelNotFound',
  rerankEvalDitingEvalFailed = 'rerankEvalDitingEvalFailed',

  // === Processor Internal Errors ===
  rerankProcessorTaskNotFound = 'rerankProcessorTaskNotFound',
  rerankProcessorTaskLostAfterPrepare = 'rerankProcessorTaskLostAfterPrepare',
  rerankProcessorTaskLostAfterFinetune = 'rerankProcessorTaskLostAfterFinetune',
  rerankProcessorTaskLostAfterRegister = 'rerankProcessorTaskLostAfterRegister',
  rerankProcessorModelConfigNotInCheckpoint = 'rerankProcessorModelConfigNotInCheckpoint',
  rerankProcessorTaskLostAfterEvalGen = 'rerankProcessorTaskLostAfterEvalGen',
  rerankProcessorTaskLostAfterEval = 'rerankProcessorTaskLostAfterEval',

  // === Trainset Generation Suggestions ===
  rerankTrainsetGenNoDataset = 'rerankTrainsetGenNoDataset',
  rerankTrainsetGenDatasetEmpty = 'rerankTrainsetGenDatasetEmpty',
  rerankTrainsetGenInsufficientChunks = 'rerankTrainsetGenInsufficientChunks',
  rerankTrainsetGenDitingFailed = 'rerankTrainsetGenDitingFailed',
  rerankTrainsetGenDitingNoData = 'rerankTrainsetGenDitingNoData',
  rerankTrainsetGenDatabaseError = 'rerankTrainsetGenDatabaseError',
  rerankTrainsetGenAlreadyGenerating = 'rerankTrainsetGenAlreadyGenerating',
  rerankTrainsetGenNotFound = 'rerankTrainsetGenNotFound',

  // === LLM Judge Stage Errors ===
  rerankLLMJudgeNoEvalData = 'rerankLLMJudgeNoEvalData',
  rerankLLMJudgeNoRankingResults = 'rerankLLMJudgeNoRankingResults',
  rerankLLMJudgeDiTingFailed = 'rerankLLMJudgeDiTingFailed',
  rerankLLMJudgeEmptyResult = 'rerankLLMJudgeEmptyResult',

  // === General Errors ===
  rerankUnknownError = 'rerankUnknownError'
}

/**
 * Suggestion enum for embedding training errors
 * Uses same naming pattern as EmbeddingTrainErrEnum for consistency
 */
export enum EmbeddingTrainSuggestionEnum {
  // Trainset errors
  embeddingTrainsetNotExist = 'embeddingTrainsetNotExist',
  embeddingTrainsetGenerating = 'embeddingTrainsetGenerating',
  embeddingTrainsetInUse = 'embeddingTrainsetInUse',
  embeddingTrainsetGenerationFailed = 'embeddingTrainsetGenerationFailed',

  // Training data errors
  embeddingTrainDataNotExist = 'embeddingTrainDataNotExist',
  embeddingNoTrainDataAvailable = 'embeddingNoTrainDataAvailable',

  // Training task errors
  embeddingTaskNotExist = 'embeddingTaskNotExist',
  embeddingTaskAlreadyRunning = 'embeddingTaskAlreadyRunning',
  embeddingTaskCannotRetry = 'embeddingTaskCannotRetry',
  embeddingTaskCannotCancel = 'embeddingTaskCannotCancel',
  embeddingTaskCannotDelete = 'embeddingTaskCannotDelete',
  embeddingTaskModelNotFound = 'embeddingTaskModelNotFound',
  embeddingTaskBaseModelDisabled = 'embeddingTaskBaseModelDisabled',
  embeddingTaskNotCompleted = 'embeddingTaskNotCompleted',
  embeddingTunedModelNotFound = 'embeddingTunedModelNotFound',

  // Eval dataset errors
  embeddingEvalDatasetNotGenerated = 'embeddingEvalDatasetNotGenerated',
  embeddingEvalDatasetEmpty = 'embeddingEvalDatasetEmpty',
  embeddingEvalResultsNotFound = 'embeddingEvalResultsNotFound',

  // External service errors
  embeddingDitingServiceError = 'embeddingDitingServiceError',
  embeddingSftBridgeServiceError = 'embeddingSftBridgeServiceError',

  // Environment validation errors
  embeddingValidationSftBridgeUnaccessible = 'embeddingValidationSftBridgeUnaccessible',
  embeddingValidationDitingUnaccessible = 'embeddingValidationDitingUnaccessible',
  embeddingValidationDatasetNoSynthesisIndex = 'embeddingValidationDatasetNoSynthesisIndex',
  embeddingValidationNoDatasetConfigured = 'embeddingValidationNoDatasetConfigured',
  embeddingValidationBaseModelNotConfigured = 'embeddingValidationBaseModelNotConfigured',

  // === Preparing Stage Errors ===
  embeddingPrepareTrainsetDeleted = 'embeddingPrepareTrainsetDeleted',
  embeddingPrepareDataEmpty = 'embeddingPrepareDataEmpty',
  embeddingPrepareTimeout = 'embeddingPrepareTimeout',
  embeddingPrepareFileSystemError = 'embeddingPrepareFileSystemError',
  embeddingPrepareDataEmptyAfterWrite = 'embeddingPrepareDataEmptyAfterWrite',
  embeddingPrepareMissingGenerateConfig = 'embeddingPrepareMissingGenerateConfig',

  // === Finetuning Stage Errors ===
  embeddingFinetuneDataPathNotFound = 'embeddingFinetuneDataPathNotFound',
  embeddingFinetuneModelConfigInvalid = 'embeddingFinetuneModelConfigInvalid',
  embeddingFinetuneDataFileNotFound = 'embeddingFinetuneDataFileNotFound',
  embeddingFinetuneSftBridgeCreateFailed = 'embeddingFinetuneSftBridgeCreateFailed',
  embeddingFinetuneQueueFull = 'embeddingFinetuneQueueFull',
  embeddingFinetuneCancelled = 'embeddingFinetuneCancelled',
  embeddingFinetuneDeploymentFailed = 'embeddingFinetuneDeploymentFailed',
  embeddingFinetuneTrainingFailed = 'embeddingFinetuneTrainingFailed',
  embeddingFinetuneTimeout = 'embeddingFinetuneTimeout',
  embeddingFinetuneDeploymentNoEndpoint = 'embeddingFinetuneDeploymentNoEndpoint',

  // === Registering Stage Errors ===
  embeddingRegisterEndpointNotFound = 'embeddingRegisterEndpointNotFound',
  embeddingRegisterBaseModelNotFound = 'embeddingRegisterBaseModelNotFound',
  embeddingRegisterAiProxyFailed = 'embeddingRegisterAiProxyFailed',
  embeddingRegisterChannelNotAvailable = 'embeddingRegisterChannelNotAvailable',

  // === Evaluating Stage Errors ===
  embeddingEvalNoDatasetConfigured = 'embeddingEvalNoDatasetConfigured',
  embeddingEvalNoDataAvailable = 'embeddingEvalNoDataAvailable',
  embeddingEvalDitingGenerationFailed = 'embeddingEvalDitingGenerationFailed',
  embeddingEvalDatabaseSaveFailed = 'embeddingEvalDatabaseSaveFailed',
  embeddingEvalDatasetEmptyBeforeEval = 'embeddingEvalDatasetEmptyBeforeEval',
  embeddingEvalDatasetSearchAllFailed = 'embeddingEvalDatasetSearchAllFailed',
  embeddingEvalModelNotFound = 'embeddingEvalModelNotFound',
  embeddingEvalDitingEvalFailed = 'embeddingEvalDitingEvalFailed',

  // === Processor Internal Errors ===
  embeddingProcessorTaskNotFound = 'embeddingProcessorTaskNotFound',
  embeddingProcessorTaskLostAfterPrepare = 'embeddingProcessorTaskLostAfterPrepare',
  embeddingProcessorTaskLostAfterFinetune = 'embeddingProcessorTaskLostAfterFinetune',
  embeddingProcessorTaskLostAfterRegister = 'embeddingProcessorTaskLostAfterRegister',
  embeddingProcessorModelConfigNotInCheckpoint = 'embeddingProcessorModelConfigNotInCheckpoint',
  embeddingProcessorTaskLostAfterEvalGen = 'embeddingProcessorTaskLostAfterEvalGen',
  embeddingProcessorTaskLostAfterEval = 'embeddingProcessorTaskLostAfterEval',

  // === Trainset Generation Suggestions ===
  embeddingTrainsetGenNoDataset = 'embeddingTrainsetGenNoDataset',
  embeddingTrainsetGenDatasetEmpty = 'embeddingTrainsetGenDatasetEmpty',
  embeddingTrainsetGenInsufficientChunks = 'embeddingTrainsetGenInsufficientChunks',
  embeddingTrainsetGenDitingFailed = 'embeddingTrainsetGenDitingFailed',
  embeddingTrainsetGenDitingNoData = 'embeddingTrainsetGenDitingNoData',
  embeddingTrainsetGenDatabaseError = 'embeddingTrainsetGenDatabaseError',
  embeddingTrainsetGenAlreadyGenerating = 'embeddingTrainsetGenAlreadyGenerating',
  embeddingTrainsetGenNotFound = 'embeddingTrainsetGenNotFound',

  // === LLM Judge Stage Errors ===
  embeddingLLMJudgeNoEvalData = 'embeddingLLMJudgeNoEvalData',
  embeddingLLMJudgeNoRankingResults = 'embeddingLLMJudgeNoRankingResults',
  embeddingLLMJudgeDiTingFailed = 'embeddingLLMJudgeDiTingFailed',
  embeddingLLMJudgeEmptyResult = 'embeddingLLMJudgeEmptyResult',

  // === General Errors ===
  embeddingUnknownError = 'embeddingUnknownError'
}

/**
 * Convert RerankTrainErrEnum to i18n message key
 * Example: rerankTrainsetNotExist -> train:rerank_trainset_not_exist
 *
 * @param type - Error type from RerankTrainErrEnum
 * @returns i18n key pointing to train.json top-level keys
 */
export function getRerankTrainErrorMessageKey(type: RerankTrainErrEnum): string {
  const snakeCase = (type as string)
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}`;
}

/**
 * Convert RerankTrainSuggestionEnum to i18n suggestion key
 * Example: rerankTrainsetNotExist -> train:rerank_trainset_not_exist_suggestion
 *
 * @param suggestion - Suggestion enum value
 * @returns i18n key pointing to train.json top-level keys
 */
export function getRerankTrainErrorSuggestionKey(suggestion: RerankTrainSuggestionEnum): string {
  const snakeCase = (suggestion as string)
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}_suggestion`;
}

/**
 * Convert EmbeddingTrainErrEnum to i18n message key
 * Example: embeddingTrainsetNotExist -> train:embedding_trainset_not_exist
 *
 * @param type - Error type from EmbeddingTrainErrEnum
 * @returns i18n key pointing to train.json top-level keys
 */
export function getEmbeddingTrainErrorMessageKey(type: EmbeddingTrainErrEnum): string {
  const snakeCase = (type as string)
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}`;
}

/**
 * Convert EmbeddingTrainSuggestionEnum to i18n suggestion key
 * Example: embeddingTrainsetNotExist -> train:embedding_trainset_not_exist_suggestion
 *
 * @param suggestion - Suggestion enum value
 * @returns i18n key pointing to train.json top-level keys
 */
export function getEmbeddingTrainErrorSuggestionKey(
  suggestion: EmbeddingTrainSuggestionEnum
): string {
  const snakeCase = (suggestion as string)
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  return `train:${snakeCase}_suggestion`;
}

/**
 * Auto-generate trainErr array using enum values for Rerank
 * statusText directly uses enum values (which already contain module prefix)
 */
const trainErr = Object.values(RerankTrainErrEnum).map((errType) => ({
  statusText: errType,
  message: i18nT(getRerankTrainErrorMessageKey(errType as any) as any)
}));

/**
 * Auto-generate embeddingTrainErr array using enum values for Embedding
 * statusText directly uses enum values (which already contain module prefix)
 */
const embeddingTrainErr = Object.values(EmbeddingTrainErrEnum).map((errType) => ({
  statusText: errType,
  message: i18nT(getEmbeddingTrainErrorMessageKey(errType as any) as any)
}));

const rerankTrainErrorCodes: ErrType<RerankTrainErrEnum> = trainErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502000 + index,
      statusText: cur.statusText as RerankTrainErrEnum,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<RerankTrainErrEnum>);

const embeddingTrainErrorCodes: ErrType<EmbeddingTrainErrEnum> = embeddingTrainErr.reduce(
  (acc, cur, index) => {
    return {
      ...acc,
      [cur.statusText]: {
        code: 502100 + index,
        statusText: cur.statusText as EmbeddingTrainErrEnum,
        message: cur.message,
        data: null
      }
    };
  },
  {} as ErrType<EmbeddingTrainErrEnum>
);

export default { ...rerankTrainErrorCodes, ...embeddingTrainErrorCodes };
