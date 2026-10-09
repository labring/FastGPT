import { getCachedSystemModelHandle } from './cache';
import type { ModelHandle } from './handle';
import { getScopedTeamModelHandle } from './teamModelCache';
import { refreshModelHandle } from './catalog/service';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';

/** 读取经过修订号检查的系统目录，明确不包含任何团队模型。 */
export const getSystemModelHandle = async (): Promise<ModelHandle> => {
  await refreshModelHandle();
  const handle = getCachedSystemModelHandle();
  if (!handle) throw new UserError(ModelErrEnum.unExist);
  return handle;
};

/** 读取系统与指定团队的完整目录；teamId 必填，缺失或非法身份直接拒绝。 */
export const getTeamModelHandle = async ({ teamId }: { teamId: string }): Promise<ModelHandle> =>
  getScopedTeamModelHandle({ teamId, systemHandle: await getSystemModelHandle() });
