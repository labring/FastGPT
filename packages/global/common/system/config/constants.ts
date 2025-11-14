export enum SystemConfigsTypeEnum {
  fastgpt = 'fastgpt',
  fastgptPro = 'fastgptPro',
  systemMsgModal = 'systemMsgModal',
  license = 'license',
  operationalAd = 'operationalAd'
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
  }
};
