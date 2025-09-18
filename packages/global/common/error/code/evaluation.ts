import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';

/* evaluation: 510000 */
export enum EvaluationErrEnum {
  // Validation errors
  evalNameRequired = 'evaluationNameRequired',
  evalNameTooLong = 'evaluationNameTooLong',
  evalDescriptionTooLong = 'evaluationDescriptionTooLong',
  evalDescriptionInvalidType = 'evaluationDescriptionInvalidType',
  evalTargetRequired = 'evaluationTargetRequired',
  evalTargetInvalidConfig = 'evaluationTargetInvalidConfig',
  evalTargetAppIdMissing = 'evaluationTargetAppIdMissing',
  evalTargetVersionIdMissing = 'evaluationTargetVersionIdMissing',
  evalEvaluatorsRequired = 'evaluationEvaluatorsRequired',
  evalEvaluatorInvalidConfig = 'evaluationEvaluatorInvalidConfig',
  evalEvaluatorInvalidScoreScaling = 'evaluationEvaluatorInvalidScoreScaling',
  evalInvalidFormat = 'evaluationInvalidFormat',
  evalIdRequired = 'evaluationIdRequired',
  evalItemIdRequired = 'evaluationItemIdRequired',
  evalDataItemIdRequired = 'evaluationDataItemIdRequired',

  // Authentication errors
  evalInsufficientPermission = 'evaluationInsufficientPermission',
  evalAppNotFound = 'evaluationAppNotFound',
  evalTaskNotFound = 'evaluationTaskNotFound',
  evalItemNotFound = 'evaluationItemNotFound',

  // Business logic errors
  evalInvalidStatus = 'evaluationInvalidStatus',
  evalInvalidStateTransition = 'evaluationInvalidStateTransition',
  evalOnlyRunningCanStop = 'evaluationOnlyRunningCanStop',
  evalOnlyFailedCanRetry = 'evaluationOnlyFailedCanRetry',
  evalItemNoErrorToRetry = 'evaluationItemNoErrorToRetry',
  evalTargetOutputRequired = 'evaluationTargetOutputRequired',
  evalEvaluatorOutputRequired = 'evaluationEvaluatorOutputRequired',
  evalDatasetLoadFailed = 'evaluationDatasetLoadFailed',
  evalTargetConfigInvalid = 'evaluationTargetConfigInvalid',
  evalEvaluatorsConfigInvalid = 'evaluationEvaluatorsConfigInvalid',
  evalUnsupportedTargetType = 'evaluationUnsupportedTargetType',
  evalAppVersionNotFound = 'evaluationAppVersionNotFound',
  evalDuplicateDatasetName = 'evaluationDuplicateDatasetName',
  evalNoDataInCollections = 'evaluationNoDataInCollections',
  evalUpdateFailed = 'evaluationUpdateFailed',
  evalLockAcquisitionFailed = 'evaluationLockAcquisitionFailed',

  // Metric related errors
  evalMetricNotFound = 'evaluationMetricNotFound',
  evalMetricUnAuth = 'evaluationMetricUnAuth',
  evalMetricNameRequired = 'evaluationMetricNameRequired',
  evalMetricNameTooLong = 'evaluationMetricNameTooLong',
  evalMetricDescriptionTooLong = 'evaluationMetricDescriptionTooLong',
  evalMetricPromptRequired = 'evaluationMetricPromptRequired',
  evalMetricPromptTooLong = 'evaluationMetricPromptTooLong',
  evalMetricTypeRequired = 'evaluationMetricTypeRequired',
  evalMetricTypeInvalid = 'evaluationMetricTypeInvalid',
  evalMetricNameInvalid = 'evaluationMetricNameInvalid',
  evalMetricBuiltinCannotModify = 'evaluationMetricBuiltinCannotModify',
  evalMetricBuiltinCannotDelete = 'evaluationMetricBuiltinCannotDelete',
  evalMetricIdRequired = 'evaluationMetricIdRequired',

  // Evaluation case related errors
  evalCaseRequired = 'evaluationCaseRequired',
  evalCaseUserInputRequired = 'evaluationCaseUserInputRequired',
  evalCaseUserInputTooLong = 'evaluationCaseUserInputTooLong',
  evalCaseActualOutputRequired = 'evaluationCaseActualOutputRequired',
  evalCaseActualOutputTooLong = 'evaluationCaseActualOutputTooLong',
  evalCaseExpectedOutputRequired = 'evaluationCaseExpectedOutputRequired',
  evalCaseExpectedOutputTooLong = 'evaluationCaseExpectedOutputTooLong',

  // LLM config related errors
  evalLLmConfigRequired = 'evaluationLLmConfigRequired',
  evalLLmModelNameRequired = 'evaluationLLmModelNameRequired',

  // Debug related errors
  debugEvaluationFailed = 'evaluationDebugFailed',

  // Evaluator related errors
  evaluatorConfigRequired = 'evaluationEvaluatorConfigRequired',
  evaluatorLLmConfigMissing = 'evaluationEvaluatorLLmConfigMissing',
  evaluatorEmbeddingConfigMissing = 'evaluationEvaluatorEmbeddingConfigMissing',
  evaluatorLLmModelNotFound = 'evaluationEvaluatorLLmModelNotFound',
  evaluatorEmbeddingModelNotFound = 'evaluationEvaluatorEmbeddingModelNotFound',
  evaluatorRequestTimeout = 'evaluationEvaluatorRequestTimeout',
  evaluatorServiceUnavailable = 'evaluationEvaluatorServiceUnavailable',
  evaluatorInvalidResponse = 'evaluationEvaluatorInvalidResponse',
  evaluatorNetworkError = 'evaluationEvaluatorNetworkError',

  // Dataset collection validation errors
  datasetCollectionNotFound = 'evaluationDatasetCollectionNotFound',
  datasetCollectionIdRequired = 'evaluationDatasetCollectionIdRequired',
  datasetCollectionUpdateFailed = 'evaluationDatasetCollectionUpdateFailed',

  // Dataset data validation errors
  datasetDataNotFound = 'evaluationDatasetDataNotFound',
  datasetModelNotFound = 'evaluationDatasetModelNotFound',
  datasetNoData = 'evaluationDatasetNoData',
  datasetDataIdRequired = 'evaluationDatasetDataIdRequired',
  evalDataQualityStatusInvalid = 'evaluationDataQualityStatusInvalid',
  evalDatasetDataListError = 'evaluationDatasetDataListError',
  datasetDataUserInputRequired = 'evaluationDatasetDataUserInputRequired',
  datasetDataExpectedOutputRequired = 'evaluationDatasetDataExpectedOutputRequired',
  datasetDataActualOutputMustBeString = 'evaluationDatasetDataActualOutputMustBeString',
  datasetDataContextMustBeArrayOfStrings = 'evaluationDatasetDataContextMustBeArrayOfStrings',
  datasetDataRetrievalContextMustBeArrayOfStrings = 'evaluationDatasetDataRetrievalContextMustBeArrayOfStrings',
  datasetDataEnableQualityEvalRequired = 'evaluationDatasetDataEnableQualityEvalRequired',
  datasetDataEvaluationModelRequiredForQuality = 'evaluationDatasetDataEvaluationModelRequiredForQuality',
  datasetDataMetadataMustBeObject = 'evaluationDatasetDataMetadataMustBeObject',
  qualityAssessmentFailed = 'evaluationQualityAssessmentFailed',
  evalDataQualityJobActiveCannotSetHighQuality = 'evaluationDataQualityJobActiveCannotSetHighQuality',

  // Task/Job related errors
  datasetTaskNotRetryable = 'evaluationDatasetTaskNotRetryable',
  datasetTaskJobNotFound = 'evaluationDatasetTaskJobNotFound',
  datasetTaskJobMismatch = 'evaluationDatasetTaskJobMismatch',
  datasetTaskOnlyFailedCanDelete = 'evaluationDatasetTaskOnlyFailedCanDelete',
  datasetTaskOperationFailed = 'evaluationDatasetTaskOperationFailed',
  datasetTaskDeleteFailed = 'evaluationDatasetTaskDeleteFailed',
  fetchFailedTasksError = 'evaluationFetchFailedTasksError',

  // File/Import related errors
  fileIdRequired = 'evaluationFileIdRequired',
  fileMustBeCSV = 'evaluationFileMustBeCSV',
  csvInvalidStructure = 'evaluationCSVInvalidStructure',
  csvTooManyRows = 'evaluationCSVTooManyRows',
  csvParsingError = 'evaluationCSVParsingError',
  csvNoDataRows = 'evaluationCSVNoDataRows',

  // Count/Resource validation errors
  countMustBeGreaterThanZero = 'evaluationCountMustBeGreaterThanZero',
  countExceedsAvailableData = 'evaluationCountExceedsAvailableData',
  selectedDatasetsContainNoData = 'evaluationSelectedDatasetsContainNoData',

  // Model validation errors
  evalModelNameInvalid = 'evaluationModelNameInvalid',
  evalModelNameTooLong = 'evaluationModelNameTooLong',

  // Summary related errors
  summaryMetricsConfigError = 'evaluationSummaryMetricsConfigError',
  summaryThresholdValueRequired = 'evaluationSummaryThresholdValueRequired',
  summaryWeightRequired = 'evaluationSummaryWeightRequired',
  summaryWeightMustBeNumber = 'evaluationSummaryWeightMustBeNumber',
  summaryThresholdMustBeNumber = 'evaluationSummaryThresholdMustBeNumber',
  summaryCalculateTypeRequired = 'evaluationSummaryCalculateTypeRequired',
  summaryCalculateTypeInvalid = 'evaluationSummaryCalculateTypeInvalid',
  summaryNoValidMetricsFound = 'evaluationSummaryNoValidMetricsFound',
  summaryStreamResponseNotSupported = 'evaluationSummaryStreamResponseNotSupported',
  summaryWeightSumMustBe100 = 'evaluationSummaryWeightSumMustBe100'
}

const evaluationErrList = [
  // Dataset related errors
  {
    statusText: EvaluationErrEnum.datasetCollectionNotFound,
    message: i18nT('evaluation:dataset_collection_not_found')
  },
  {
    statusText: EvaluationErrEnum.datasetDataNotFound,
    message: i18nT('evaluation:dataset_data_not_found')
  },

  // Validation errors
  {
    statusText: EvaluationErrEnum.evalNameRequired,
    message: i18nT('evaluation:name_required')
  },
  {
    statusText: EvaluationErrEnum.evalNameTooLong,
    message: i18nT('evaluation:name_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalDescriptionTooLong,
    message: i18nT('evaluation:description_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalTargetRequired,
    message: i18nT('evaluation:target_required')
  },
  {
    statusText: EvaluationErrEnum.evalTargetInvalidConfig,
    message: i18nT('evaluation:target_invalid_config')
  },
  {
    statusText: EvaluationErrEnum.evalTargetAppIdMissing,
    message: i18nT('evaluation:target_app_id_missing')
  },
  {
    statusText: EvaluationErrEnum.evalTargetVersionIdMissing,
    message: i18nT('evaluation:target_version_id_missing')
  },
  {
    statusText: EvaluationErrEnum.evalEvaluatorsRequired,
    message: i18nT('evaluation:evaluators_required')
  },
  {
    statusText: EvaluationErrEnum.evalEvaluatorInvalidConfig,
    message: i18nT('evaluation:evaluator_invalid_config')
  },
  {
    statusText: EvaluationErrEnum.evalEvaluatorInvalidScoreScaling,
    message: i18nT('evaluation:evaluator_invalid_score_scaling')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidFormat,
    message: i18nT('evaluation:invalid_format')
  },
  {
    statusText: EvaluationErrEnum.evalIdRequired,
    message: i18nT('evaluation:id_required')
  },
  {
    statusText: EvaluationErrEnum.evalItemIdRequired,
    message: i18nT('evaluation:item_id_required')
  },
  {
    statusText: EvaluationErrEnum.evalDataItemIdRequired,
    message: i18nT('evaluation:data_item_id_required')
  },

  // Authentication errors
  {
    statusText: EvaluationErrEnum.evalInsufficientPermission,
    message: i18nT('evaluation:insufficient_permission')
  },
  {
    statusText: EvaluationErrEnum.evalAppNotFound,
    message: i18nT('evaluation:app_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalTaskNotFound,
    message: i18nT('evaluation:task_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalItemNotFound,
    message: i18nT('evaluation:item_not_found')
  },

  // Business logic errors
  {
    statusText: EvaluationErrEnum.evalInvalidStatus,
    message: i18nT('evaluation:invalid_status')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidStateTransition,
    message: i18nT('evaluation:invalid_state_transition')
  },
  {
    statusText: EvaluationErrEnum.evalOnlyRunningCanStop,
    message: i18nT('evaluation:only_running_can_stop')
  },
  {
    statusText: EvaluationErrEnum.evalOnlyFailedCanRetry,
    message: i18nT('evaluation:only_failed_can_retry')
  },
  {
    statusText: EvaluationErrEnum.evalItemNoErrorToRetry,
    message: i18nT('evaluation:item_no_error_to_retry')
  },
  {
    statusText: EvaluationErrEnum.evalTargetOutputRequired,
    message: i18nT('evaluation:target_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalEvaluatorOutputRequired,
    message: i18nT('evaluation:evaluator_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalDatasetLoadFailed,
    message: i18nT('evaluation:dataset_load_failed')
  },
  {
    statusText: EvaluationErrEnum.evalTargetConfigInvalid,
    message: i18nT('evaluation:target_config_invalid')
  },
  {
    statusText: EvaluationErrEnum.evalEvaluatorsConfigInvalid,
    message: i18nT('evaluation:evaluators_config_invalid')
  },
  {
    statusText: EvaluationErrEnum.evalUnsupportedTargetType,
    message: i18nT('evaluation:unsupported_target_type')
  },
  {
    statusText: EvaluationErrEnum.evalAppVersionNotFound,
    message: i18nT('evaluation:app_version_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalDuplicateDatasetName,
    message: i18nT('evaluation:duplicate_dataset_name')
  },
  {
    statusText: EvaluationErrEnum.evalNoDataInCollections,
    message: i18nT('evaluation:no_data_in_collections')
  },
  {
    statusText: EvaluationErrEnum.evalUpdateFailed,
    message: i18nT('evaluation:update_failed')
  },
  {
    statusText: EvaluationErrEnum.evalLockAcquisitionFailed,
    message: i18nT('evaluation:lock_acquisition_failed')
  },
  // Metric related errors
  {
    statusText: EvaluationErrEnum.evalMetricNotFound,
    message: i18nT('evaluation:metric_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalMetricUnAuth,
    message: i18nT('evaluation:metric_un_auth')
  },
  {
    statusText: EvaluationErrEnum.evalMetricNameRequired,
    message: i18nT('evaluation:metric_name_required')
  },
  {
    statusText: EvaluationErrEnum.evalMetricNameTooLong,
    message: i18nT('evaluation:metric_name_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalMetricDescriptionTooLong,
    message: i18nT('evaluation:metric_description_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalMetricPromptRequired,
    message: i18nT('evaluation:metric_prompt_required')
  },
  {
    statusText: EvaluationErrEnum.evalMetricPromptTooLong,
    message: i18nT('evaluation:metric_prompt_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalMetricTypeRequired,
    message: i18nT('evaluation:metric_type_required')
  },
  {
    statusText: EvaluationErrEnum.evalMetricTypeInvalid,
    message: i18nT('evaluation:metric_type_invalid')
  },
  {
    statusText: EvaluationErrEnum.evalMetricNameInvalid,
    message: i18nT('evaluation:metric_name_invalid')
  },
  {
    statusText: EvaluationErrEnum.evalMetricBuiltinCannotModify,
    message: i18nT('evaluation:metric_builtin_cannot_modify')
  },
  {
    statusText: EvaluationErrEnum.evalMetricBuiltinCannotDelete,
    message: i18nT('evaluation:metric_builtin_cannot_delete')
  },
  {
    statusText: EvaluationErrEnum.evalMetricIdRequired,
    message: i18nT('evaluation:metric_id_required')
  },

  // Evaluation case related errors
  {
    statusText: EvaluationErrEnum.evalCaseRequired,
    message: i18nT('evaluation:eval_case_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseUserInputRequired,
    message: i18nT('evaluation:eval_case_user_input_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseUserInputTooLong,
    message: i18nT('evaluation:eval_case_user_input_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalCaseActualOutputRequired,
    message: i18nT('evaluation:eval_case_actual_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseActualOutputTooLong,
    message: i18nT('evaluation:eval_case_actual_output_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalCaseExpectedOutputRequired,
    message: i18nT('evaluation:eval_case_expected_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseExpectedOutputTooLong,
    message: i18nT('evaluation:eval_case_expected_output_too_long')
  },

  // LLM config related errors
  {
    statusText: EvaluationErrEnum.evalLLmConfigRequired,
    message: i18nT('evaluation:llm_config_required')
  },
  {
    statusText: EvaluationErrEnum.evalLLmModelNameRequired,
    message: i18nT('evaluation:llm_model_name_required')
  },

  // Debug related errors
  {
    statusText: EvaluationErrEnum.debugEvaluationFailed,
    message: i18nT('evaluation:debug_evaluation_failed')
  },

  // Evaluator related errors
  {
    statusText: EvaluationErrEnum.evaluatorConfigRequired,
    message: i18nT('evaluation:evaluator_config_required')
  },
  {
    statusText: EvaluationErrEnum.evaluatorLLmConfigMissing,
    message: i18nT('evaluation:evaluator_llm_config_missing')
  },
  {
    statusText: EvaluationErrEnum.evaluatorEmbeddingConfigMissing,
    message: i18nT('evaluation:evaluator_embedding_config_missing')
  },
  {
    statusText: EvaluationErrEnum.evaluatorLLmModelNotFound,
    message: i18nT('evaluation:evaluator_llm_model_not_found')
  },
  {
    statusText: EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
    message: i18nT('evaluation:evaluator_embedding_model_not_found')
  },
  {
    statusText: EvaluationErrEnum.evaluatorRequestTimeout,
    message: i18nT('evaluation:evaluator_request_timeout')
  },
  {
    statusText: EvaluationErrEnum.evaluatorServiceUnavailable,
    message: i18nT('evaluation:evaluator_service_unavailable')
  },
  {
    statusText: EvaluationErrEnum.evaluatorInvalidResponse,
    message: i18nT('evaluation:evaluator_invalid_response')
  },
  {
    statusText: EvaluationErrEnum.evaluatorNetworkError,
    message: i18nT('evaluation:evaluator_network_error')
  },

  // Dataset collection validation errors
  {
    statusText: EvaluationErrEnum.datasetCollectionIdRequired,
    message: i18nT('evaluation:dataset_collection_id_required')
  },
  {
    statusText: EvaluationErrEnum.datasetCollectionUpdateFailed,
    message: i18nT('evaluation:dataset_collection_update_failed')
  },
  {
    statusText: EvaluationErrEnum.datasetModelNotFound,
    message: i18nT('evaluation:dataset_model_not_found')
  },
  {
    statusText: EvaluationErrEnum.datasetNoData,
    message: i18nT('evaluation:dataset_no_data')
  },

  // Dataset data validation errors
  {
    statusText: EvaluationErrEnum.datasetDataIdRequired,
    message: i18nT('evaluation:dataset_data_id_required')
  },
  {
    statusText: EvaluationErrEnum.evalDataQualityStatusInvalid,
    message: i18nT('evaluation:data_quality_status_invalid')
  },
  {
    statusText: EvaluationErrEnum.datasetDataUserInputRequired,
    message: i18nT('evaluation:dataset_data_user_input_required')
  },
  {
    statusText: EvaluationErrEnum.datasetDataExpectedOutputRequired,
    message: i18nT('evaluation:dataset_data_expected_output_required')
  },
  {
    statusText: EvaluationErrEnum.datasetDataActualOutputMustBeString,
    message: i18nT('evaluation:dataset_data_actual_output_must_be_string')
  },
  {
    statusText: EvaluationErrEnum.datasetDataContextMustBeArrayOfStrings,
    message: i18nT('evaluation:dataset_data_context_must_be_array_of_strings')
  },
  {
    statusText: EvaluationErrEnum.datasetDataRetrievalContextMustBeArrayOfStrings,
    message: i18nT('evaluation:dataset_data_retrieval_context_must_be_array_of_strings')
  },
  {
    statusText: EvaluationErrEnum.datasetDataEnableQualityEvalRequired,
    message: i18nT('evaluation:dataset_data_enable_quality_eval_required')
  },
  {
    statusText: EvaluationErrEnum.datasetDataEvaluationModelRequiredForQuality,
    message: i18nT('evaluation:dataset_data_evaluation_model_required_for_quality')
  },
  {
    statusText: EvaluationErrEnum.datasetDataMetadataMustBeObject,
    message: i18nT('evaluation:dataset_data_metadata_must_be_object')
  },
  {
    statusText: EvaluationErrEnum.evalDatasetDataListError,
    message: i18nT('evaluation:dataset_data_list_error')
  },
  {
    statusText: EvaluationErrEnum.qualityAssessmentFailed,
    message: i18nT('evaluation:quality_assessment_failed')
  },
  {
    statusText: EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality,
    message: i18nT('evaluation:data_quality_job_active_cannot_set_high_quality')
  },

  // Task/Job related errors
  {
    statusText: EvaluationErrEnum.datasetTaskNotRetryable,
    message: i18nT('evaluation:dataset_task_not_retryable')
  },
  {
    statusText: EvaluationErrEnum.datasetTaskJobNotFound,
    message: i18nT('evaluation:dataset_task_job_not_found')
  },
  {
    statusText: EvaluationErrEnum.datasetTaskJobMismatch,
    message: i18nT('evaluation:dataset_task_job_mismatch')
  },
  {
    statusText: EvaluationErrEnum.datasetTaskOnlyFailedCanDelete,
    message: i18nT('evaluation:dataset_task_only_failed_can_delete')
  },
  {
    statusText: EvaluationErrEnum.datasetTaskOperationFailed,
    message: i18nT('evaluation:dataset_task_operation_failed')
  },
  {
    statusText: EvaluationErrEnum.datasetTaskDeleteFailed,
    message: i18nT('evaluation:dataset_task_delete_failed')
  },
  {
    statusText: EvaluationErrEnum.fetchFailedTasksError,
    message: i18nT('evaluation:fetch_failed_tasks_error')
  },

  // File/Import related errors
  {
    statusText: EvaluationErrEnum.fileIdRequired,
    message: i18nT('evaluation:file_id_required')
  },
  {
    statusText: EvaluationErrEnum.fileMustBeCSV,
    message: i18nT('evaluation:file_must_be_csv')
  },
  {
    statusText: EvaluationErrEnum.csvInvalidStructure,
    message: i18nT('evaluation:csv_invalid_structure')
  },
  {
    statusText: EvaluationErrEnum.csvTooManyRows,
    message: i18nT('evaluation:csv_too_many_rows')
  },
  {
    statusText: EvaluationErrEnum.csvParsingError,
    message: i18nT('evaluation:csv_parsing_error')
  },
  {
    statusText: EvaluationErrEnum.csvNoDataRows,
    message: i18nT('evaluation:csv_no_data_rows')
  },

  // Count/Resource validation errors
  {
    statusText: EvaluationErrEnum.countMustBeGreaterThanZero,
    message: i18nT('evaluation:count_must_be_greater_than_zero')
  },
  {
    statusText: EvaluationErrEnum.countExceedsAvailableData,
    message: i18nT('evaluation:count_exceeds_available_data')
  },
  {
    statusText: EvaluationErrEnum.selectedDatasetsContainNoData,
    message: i18nT('evaluation:selected_datasets_contain_no_data')
  },

  // Summary related errors
  {
    statusText: EvaluationErrEnum.summaryMetricsConfigError,
    message: i18nT('evaluation:summary_metrics_config_error')
  },
  {
    statusText: EvaluationErrEnum.summaryThresholdValueRequired,
    message: i18nT('evaluation:summary_threshold_value_required')
  },
  {
    statusText: EvaluationErrEnum.summaryWeightRequired,
    message: i18nT('evaluation:summary_weight_required')
  },
  {
    statusText: EvaluationErrEnum.summaryWeightMustBeNumber,
    message: i18nT('evaluation:summary_weight_must_be_number')
  },
  {
    statusText: EvaluationErrEnum.summaryThresholdMustBeNumber,
    message: i18nT('evaluation:summary_threshold_must_be_number')
  },
  {
    statusText: EvaluationErrEnum.summaryCalculateTypeRequired,
    message: i18nT('evaluation:summary_calculate_type_required')
  },
  {
    statusText: EvaluationErrEnum.summaryCalculateTypeInvalid,
    message: i18nT('evaluation:summary_calculate_type_invalid')
  },
  {
    statusText: EvaluationErrEnum.summaryNoValidMetricsFound,
    message: i18nT('evaluation:summary_no_valid_metrics_found')
  },
  {
    statusText: EvaluationErrEnum.summaryStreamResponseNotSupported,
    message: i18nT('evaluation:summary_stream_response_not_supported')
  },
  {
    statusText: EvaluationErrEnum.summaryWeightSumMustBe100,
    message: i18nT('evaluation:summary_weight_sum_must_be_100')
  },

  // Model validation errors
  {
    statusText: EvaluationErrEnum.evalModelNameInvalid,
    message: i18nT('evaluation:model_name_invalid')
  },
  {
    statusText: EvaluationErrEnum.evalModelNameTooLong,
    message: i18nT('evaluation:model_name_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalDescriptionInvalidType,
    message: i18nT('evaluation:description_invalid_type')
  }
];

export default evaluationErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 510000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${EvaluationErrEnum}`>);
