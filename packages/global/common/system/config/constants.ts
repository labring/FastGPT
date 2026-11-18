export enum SystemConfigsTypeEnum {
  fastgpt = 'fastgpt',
  fastgptPro = 'fastgptPro',
  /** @deprecated 历史开发期记录；Pro ENV 现存于 system_instance_configs 的 proEnv scope。 */
  proEnv = 'proEnv',
  subPlans = 'subPlans',
  langfuse = 'langfuse',
  systemMsgModal = 'systemMsgModal',
  license = 'license',
  operationalAd = 'operationalAd',
  activityAd = 'activityAd',
  instanceId = 'instanceId',
  modelStatusProbe = 'modelStatusProbe',
  moderationPolicy = 'moderationPolicy'
}

export const SystemConfigsTypeMap = {
  [SystemConfigsTypeEnum.proEnv]: { label: 'Pro 环境能力' },
  [SystemConfigsTypeEnum.subPlans]: { label: '订阅套餐' },
  [SystemConfigsTypeEnum.langfuse]: { label: 'Langfuse 追踪' },
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
  [SystemConfigsTypeEnum.instanceId]: {
    label: '部署实例 ID'
  },
  [SystemConfigsTypeEnum.modelStatusProbe]: {
    label: '模型状态探测'
  },
  [SystemConfigsTypeEnum.moderationPolicy]: {
    label: '内容审核策略'
  }
};
