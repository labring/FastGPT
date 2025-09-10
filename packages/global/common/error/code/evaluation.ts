import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';

/* evaluation: 510000 */
export enum EvaluationErrEnum {
  // Dataset related errors
  evalDatasetCollectionNotFound = 'evaluationDatasetCollectionNotFound',
  evalDatasetDataNotFound = 'evaluationDatasetDataNotFound',

  // Validation errors (510002-510049)
  evalNameRequired = 'evaluationNameRequired',
  evalNameTooLong = 'evaluationNameTooLong',
  evalDescriptionTooLong = 'evaluationDescriptionTooLong',
  evalDatasetIdRequired = 'evaluationDatasetIdRequired',
  evalTargetRequired = 'evaluationTargetRequired',
  evalTargetInvalidConfig = 'evaluationTargetInvalidConfig',
  evalTargetAppIdMissing = 'evaluationTargetAppIdMissing',
  evalEvaluatorsRequired = 'evaluationEvaluatorsRequired',
  evalEvaluatorInvalidConfig = 'evaluationEvaluatorInvalidConfig',
  evalInvalidFormat = 'evaluationInvalidFormat',
  evalIdRequired = 'evaluationIdRequired',
  evalItemIdRequired = 'evaluationItemIdRequired',
  evalDataItemIdRequired = 'evaluationDataItemIdRequired',

  // Authentication errors (510050-510069)
  evalInsufficientPermission = 'evaluationInsufficientPermission',
  evalAppNotFound = 'evaluationAppNotFound',
  evalTaskNotFound = 'evaluationTaskNotFound',
  evalItemNotFound = 'evaluationItemNotFound',

  // Business logic errors (510070-510099)
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
    statusText: EvaluationErrEnum.evalDatasetCollectionNotFound,
    message: i18nT('evaluation:dataset_collection_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalDatasetDataNotFound,
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
    statusText: EvaluationErrEnum.evalDatasetIdRequired,
    message: i18nT('evaluation:dataset_id_required')
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
    statusText: EvaluationErrEnum.evalEvaluatorsRequired,
    message: i18nT('evaluation:evaluators_required')
  },
  {
    statusText: EvaluationErrEnum.evalEvaluatorInvalidConfig,
    message: i18nT('evaluation:evaluator_invalid_config')
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
