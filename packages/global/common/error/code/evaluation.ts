import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';

/* evaluation: 510000 */
export enum EvaluationErrEnum {
  // Dataset related errors
  evalDatasetCollectionNotFound = 'evaluationDatasetCollectionNotFound',
  evalDatasetDataNotFound = 'evaluationDatasetDataNotFound'
}

const evaluationErrList = [
  // Evaluation Dataset related errors
  {
    statusText: EvaluationErrEnum.evalDatasetCollectionNotFound,
    message: i18nT('evaluation_dataset:dataset_collection_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalDatasetDataNotFound,
    message: i18nT('evaluation_dataset:dataset_data_not_found')
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
