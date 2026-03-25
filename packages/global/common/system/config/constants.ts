export enum SystemConfigsTypeEnum {
  fastgpt = 'fastgpt',
  fastgptPro = 'fastgptPro',
  systemMsgModal = 'systemMsgModal',
  license = 'license',
  operationalAd = 'operationalAd',
  activityAd = 'activityAd',
  sf_lic = 'sf_lic'
}

export const SystemConfigsTypeMap = {
  [SystemConfigsTypeEnum.fastgpt]: {
    label: 'fastgpt'
  },
  [SystemConfigsTypeEnum.fastgptPro]: {
    label: 'fastgptPro'
  },
  [SystemConfigsTypeEnum.systemMsgModal]: {
    label: 'systemMsgModal'
  },
  [SystemConfigsTypeEnum.license]: {
    label: 'license'
  },
  [SystemConfigsTypeEnum.operationalAd]: {
    label: 'operationalAd'
  },
  [SystemConfigsTypeEnum.activityAd]: {
    label: 'activityAd'
  },
  [SystemConfigsTypeEnum.sf_lic]: {
    label: 'sf_lic'
  }
};
