import { getFileSizeLimitBytes } from '@fastgpt/global/core/workflow/fileLimit';
import { getTeamPlanStatus } from '../wallet/sub/utils';

/** 在完成团队鉴权后解析统一的单文件业务上限，返回值固定为字节。 */
export const getTeamFileSizeLimitBytes = async ({ teamId }: { teamId: string }) => {
  const planStatus = await getTeamPlanStatus({ teamId });

  return getFileSizeLimitBytes({
    teamMaxFileSize: planStatus.standard?.maxUploadFileSize,
    systemMaxFileSize: global.feConfigs.uploadFileMaxSize
  });
};
