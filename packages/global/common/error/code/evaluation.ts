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
  evalCollectionIdRequired = 'evaluationCollectionIdRequired',
  evalUserInputRequired = 'evaluationUserInputRequired',
  evalExpectedOutputRequired = 'evaluationExpectedOutputRequired',
  evalInvalidPageNumber = 'evaluationInvalidPageNumber',
  evalInvalidPageSize = 'evaluationInvalidPageSize',
  evalMetricNameRequired = 'evaluationMetricNameRequired',
  evalMetricNameTooLong = 'evaluationMetricNameTooLong',
  evalMetricPromptRequired = 'evaluationMetricPromptRequired',
  evalMetricPromptTooLong = 'evaluationMetricPromptTooLong',
  evalInvalidFormat = 'evaluationInvalidFormat',
  evalCountMustBePositive = 'evaluationCountMustBePositive',
  evalInvalidContext = 'evaluationInvalidContext',
  evalInvalidRetrievalContext = 'evaluationInvalidRetrievalContext',

  // Authentication errors (510050-510069)
  evalInsufficientPermission = 'evaluationInsufficientPermission',
  evalAppNotFound = 'evaluationAppNotFound',
  evalAppNoPermission = 'evaluationAppNoPermission',
  evalTaskNotFound = 'evaluationTaskNotFound',
  evalItemNotFound = 'evaluationItemNotFound',
  evalMetricNotFound = 'evaluationMetricNotFound',
  evalMetricBuiltinCannotModify = 'evaluationMetricBuiltinCannotModify',
  evalMetricBuiltinCannotDelete = 'evaluationMetricBuiltinCannotDelete',

  // Business logic errors (510070-510099)
  evalInvalidStatus = 'evaluationInvalidStatus',
  evalOnlyQueuingCanStart = 'evaluationOnlyQueuingCanStart',
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
  evalLockAcquisitionFailed = 'evaluationLockAcquisitionFailed'
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
    statusText: EvaluationErrEnum.evalCollectionIdRequired,
    message: i18nT('evaluation:collection_id_required')
  },
  {
    statusText: EvaluationErrEnum.evalUserInputRequired,
    message: i18nT('evaluation:user_input_required')
  },
  {
    statusText: EvaluationErrEnum.evalExpectedOutputRequired,
    message: i18nT('evaluation:expected_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidPageNumber,
    message: i18nT('evaluation:invalid_page_number')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidPageSize,
    message: i18nT('evaluation:invalid_page_size')
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
    statusText: EvaluationErrEnum.evalMetricPromptRequired,
    message: i18nT('evaluation:metric_prompt_required')
  },
  {
    statusText: EvaluationErrEnum.evalMetricPromptTooLong,
    message: i18nT('evaluation:metric_prompt_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidFormat,
    message: i18nT('evaluation:invalid_format')
  },
  {
    statusText: EvaluationErrEnum.evalCountMustBePositive,
    message: i18nT('evaluation:count_must_be_positive')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidContext,
    message: i18nT('evaluation:invalid_context')
  },
  {
    statusText: EvaluationErrEnum.evalInvalidRetrievalContext,
    message: i18nT('evaluation:invalid_retrieval_context')
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
    statusText: EvaluationErrEnum.evalAppNoPermission,
    message: i18nT('evaluation:app_no_permission')
  },
  {
    statusText: EvaluationErrEnum.evalTaskNotFound,
    message: i18nT('evaluation:task_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalItemNotFound,
    message: i18nT('evaluation:item_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalMetricNotFound,
    message: i18nT('evaluation:metric_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalMetricBuiltinCannotModify,
    message: i18nT('evaluation:metric_builtin_cannot_modify')
  },
  {
    statusText: EvaluationErrEnum.evalMetricBuiltinCannotDelete,
    message: i18nT('evaluation:metric_builtin_cannot_delete')
  },

  // Business logic errors
  {
    statusText: EvaluationErrEnum.evalInvalidStatus,
    message: i18nT('evaluation:invalid_status')
  },
  {
    statusText: EvaluationErrEnum.evalOnlyQueuingCanStart,
    message: i18nT('evaluation:only_queuing_can_start')
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
