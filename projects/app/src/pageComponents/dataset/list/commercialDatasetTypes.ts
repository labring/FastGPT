import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { CreateDatasetType } from './CreateModal';

/** Web 站点与第三方知识库仅商业版可创建；社区版在新建入口点击后弹出 ProModal。 */
export const commercialDatasetTypes: readonly CreateDatasetType[] = [
  DatasetTypeEnum.websiteDataset,
  DatasetTypeEnum.apiDataset,
  DatasetTypeEnum.feishu,
  DatasetTypeEnum.yuque,
  DatasetTypeEnum.dingtalk
];

/** 判断是否为商业版专属知识库类型。 */
export const isCommercialDatasetType = (type: CreateDatasetType) =>
  commercialDatasetTypes.includes(type);

export type DatasetCreateAction = 'create' | 'proModal';

/**
 * 根据商业版状态与知识库类型，决定新建入口的下一步动作。
 * 社区版点击 Web/第三方类型时返回 proModal，其余情况进入创建弹窗。
 */
export const resolveDatasetCreateAction = (
  type: CreateDatasetType,
  isPlus?: boolean
): DatasetCreateAction => {
  if (!isPlus && isCommercialDatasetType(type)) {
    return 'proModal';
  }
  return 'create';
};
