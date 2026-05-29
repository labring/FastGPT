import { i18nT } from '../../i18n/utils';
import { type ErrType } from '../errorCode';

/* model: 511000 */
const startCode = 511000;
export enum ModelErrEnum {
  unExist = 'unExistModel',
  systemModelCannotDelete = 'systemModelCannotDelete',
  customModelMissingFields = 'customModelMissingFields',
  customModelMissingName = 'customModelMissingName',
  customModelMissingType = 'customModelMissingType',
  systemModelNotSupportUpdate = 'systemModelNotSupportUpdate',
  invalidModelId = 'invalidModelId',
  invalidTmbId = 'invalidTmbId',
  invalidTeamId = 'invalidTeamId',
  invalidModelOrMetadata = 'invalidModelOrMetadata',
  metadataProviderRequired = 'metadataProviderRequired',
  metadataModelRequired = 'metadataModelRequired',
  modelTypeNotSupported = 'modelTypeNotSupported',
  modelNotActive = 'modelNotActive',
  modelResponseEmpty = 'modelResponseEmpty',
  pageNumPositiveInteger = 'pageNumPositiveInteger',
  pageSizePositiveInteger = 'pageSizePositiveInteger'
}
const modelErr = [
  {
    statusText: ModelErrEnum.unExist,
    message: i18nT('common:error.model_not_exist')
  },
  {
    statusText: ModelErrEnum.systemModelCannotDelete,
    message: i18nT('common:error.system_model_cannot_delete')
  },
  {
    statusText: ModelErrEnum.customModelMissingFields,
    message: i18nT('common:error.custom_model_missing_fields')
  },
  {
    statusText: ModelErrEnum.customModelMissingName,
    message: i18nT('common:error.custom_model_missing_name')
  },
  {
    statusText: ModelErrEnum.customModelMissingType,
    message: i18nT('common:error.custom_model_missing_type')
  },
  {
    statusText: ModelErrEnum.systemModelNotSupportUpdate,
    message: i18nT('common:error.system_model_not_support_update')
  },
  {
    statusText: ModelErrEnum.invalidModelId,
    message: i18nT('common:error.invalid_model_id')
  },
  {
    statusText: ModelErrEnum.invalidTmbId,
    message: i18nT('common:error.invalid_tmb_id')
  },
  {
    statusText: ModelErrEnum.invalidTeamId,
    message: i18nT('common:error.invalid_team_id')
  },
  {
    statusText: ModelErrEnum.invalidModelOrMetadata,
    message: i18nT('common:error.invalid_model_or_metadata')
  },
  {
    statusText: ModelErrEnum.metadataProviderRequired,
    message: i18nT('common:error.metadata_provider_required')
  },
  {
    statusText: ModelErrEnum.metadataModelRequired,
    message: i18nT('common:error.metadata_model_required')
  },
  {
    statusText: ModelErrEnum.modelTypeNotSupported,
    message: i18nT('common:error.model_type_not_supported')
  },
  {
    statusText: ModelErrEnum.modelNotActive,
    message: i18nT('common:error.model_not_active')
  },
  {
    statusText: ModelErrEnum.modelResponseEmpty,
    message: i18nT('common:error.model_response_empty')
  },
  {
    statusText: ModelErrEnum.pageNumPositiveInteger,
    message: i18nT('common:error.page_num_must_be_positive_integer')
  },
  {
    statusText: ModelErrEnum.pageSizePositiveInteger,
    message: i18nT('common:error.page_size_must_be_positive_integer')
  }
];
export default modelErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: startCode + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${ModelErrEnum}`>);
