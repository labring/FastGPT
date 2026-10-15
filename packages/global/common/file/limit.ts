import type { FastGPTFeConfigsType } from '../system/types';
import type { TeamSubSchemaType } from '../../support/wallet/sub/type';

type UploadPlan = Pick<TeamSubSchemaType, 'maxUploadFileSize' | 'maxUploadFileCount'>;

/**
 * 解析用户上传额度：团队覆盖值 → 套餐配置 → 系统配置 → 默认值。
 * 大小单位为 MB；大小和数量的 0 均表示未配置，使用 || 跳过历史空值转换得到的 0。
 * 此处只处理用户额度，工作流模块的文件数量上限仍由模块逻辑单独约束。
 */
export const getFileUploadLimits = ({
  teamPlan,
  plan,
  systemLimit
}: {
  teamPlan?: UploadPlan;
  plan?: UploadPlan;
  systemLimit?: Partial<
    Pick<FastGPTFeConfigsType['limit'], 'uploadFileMaxSize' | 'uploadFileMaxAmount'>
  >;
}) => ({
  maxUploadFileSize:
    teamPlan?.maxUploadFileSize ||
    plan?.maxUploadFileSize ||
    systemLimit?.uploadFileMaxSize ||
    1000,
  maxUploadFileCount:
    teamPlan?.maxUploadFileCount ||
    plan?.maxUploadFileCount ||
    systemLimit?.uploadFileMaxAmount ||
    1000
});
