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

  // 评测数据集错误
  evalDatasetNotGenerated = 'evalDatasetNotGenerated',
  evalDatasetEmpty = 'evalDatasetEmpty',

  // 外部服务错误
  ditingServiceError = 'ditingServiceError',
  aicpServiceError = 'aicpServiceError'
}

const trainErr = [
  // Trainset errors
  {
    statusText: RerankTrainErrEnum.trainsetNotExist,
    message: i18nT('train:trainset_not_exist')
  },
  {
    statusText: RerankTrainErrEnum.trainsetGenerating,
    message: i18nT('train:trainset_generating')
  },
  {
    statusText: RerankTrainErrEnum.trainsetAlreadyReady,
    message: i18nT('train:trainset_already_ready')
  },
  {
    statusText: RerankTrainErrEnum.trainsetNotReady,
    message: i18nT('train:trainset_not_ready')
  },
  {
    statusText: RerankTrainErrEnum.trainsetInUse,
    message: i18nT('train:trainset_in_use')
  },
  {
    statusText: RerankTrainErrEnum.trainsetGenerationFailed,
    message: i18nT('train:trainset_generation_failed')
  },

  // Training data errors
  {
    statusText: RerankTrainErrEnum.trainDataNotExist,
    message: i18nT('train:train_data_not_exist')
  },
  {
    statusText: RerankTrainErrEnum.noTrainDataAvailable,
    message: i18nT('train:no_train_data_available')
  },
  {
    statusText: RerankTrainErrEnum.noDatasetAvailable,
    message: i18nT('train:no_dataset_available')
  },

  // Training task errors
  {
    statusText: RerankTrainErrEnum.taskNotExist,
    message: i18nT('train:task_not_exist')
  },
  {
    statusText: RerankTrainErrEnum.taskAlreadyRunning,
    message: i18nT('train:task_already_running')
  },
  {
    statusText: RerankTrainErrEnum.taskCannotRetry,
    message: i18nT('train:task_cannot_retry')
  },
  {
    statusText: RerankTrainErrEnum.taskCannotCancel,
    message: i18nT('train:task_cannot_cancel')
  },
  {
    statusText: RerankTrainErrEnum.taskCannotDelete,
    message: i18nT('train:task_cannot_delete')
  },

  // Evaluation dataset errors
  {
    statusText: RerankTrainErrEnum.evalDatasetNotGenerated,
    message: i18nT('train:eval_dataset_not_generated')
  },
  {
    statusText: RerankTrainErrEnum.evalDatasetEmpty,
    message: i18nT('train:eval_dataset_empty')
  },

  // External service errors
  {
    statusText: RerankTrainErrEnum.ditingServiceError,
    message: i18nT('train:diting_service_error')
  },
  {
    statusText: RerankTrainErrEnum.aicpServiceError,
    message: i18nT('train:aicp_service_error')
  }
];

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
