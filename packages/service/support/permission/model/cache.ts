import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import type { ClientSession } from '../../../common/mongo';
import { getTmpData, setTmpData } from '../../tmpData/controller';
import { MongoTmpData } from '../../tmpData/schema';

/** dataId 固定为 `my_models--{teamId}--{tmbId}`，按前缀即可定位团队或全部成员缓存。 */
const getMemberModelsCachePrefix = (teamId?: string) =>
  new RegExp(`^${TmpDataEnum.MemberModels}--${teamId ? `${teamId}--` : ''}`);

/**
 * 删除团队下所有成员的模型使用权缓存，下一次鉴权惰性重建。
 * 模型 ACL、用户组、组织、成员变更时调用；模型目录变化由 catalogVersion 自动失效，无需调用。
 */
export const clearMemberModelsCache = ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) =>
  MongoTmpData.deleteMany({ dataId: { $regex: getMemberModelsCachePrefix(teamId) } }, { session });

/** 删除全部成员的模型使用权缓存，仅用于批量迁移权限数据。 */
export const clearAllMemberModelsCache = ({ session }: { session?: ClientSession } = {}) =>
  MongoTmpData.deleteMany({ dataId: { $regex: getMemberModelsCachePrefix() } }, { session });

/** 读取与当前模型目录和管理身份匹配的完整成员模型使用权缓存。 */
export const getMemberModelsCache = async ({
  teamId,
  tmbId,
  catalogVersion,
  hasManagePer
}: {
  teamId: string;
  tmbId: string;
  catalogVersion: string;
  hasManagePer: boolean;
}) => {
  const cached = await getTmpData({ type: TmpDataEnum.MemberModels, metadata: { teamId, tmbId } });
  if (cached?.data.catalogVersion === catalogVersion && cached.data.hasManagePer === hasManagePer)
    return cached.data;
};

/** 保存完整成员使用权集合；不接受单次待检查模型作为完整缓存范围。 */
export const setMemberModelsCache = ({
  teamId,
  tmbId,
  modelIds,
  catalogVersion,
  hasManagePer
}: {
  teamId: string;
  tmbId: string;
  modelIds: string[];
  catalogVersion: string;
  hasManagePer: boolean;
}) =>
  setTmpData({
    type: TmpDataEnum.MemberModels,
    metadata: { teamId, tmbId },
    data: {
      teamId,
      tmbId,
      modelIds,
      catalogVersion,
      hasManagePer
    }
  });
