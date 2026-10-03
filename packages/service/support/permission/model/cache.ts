import type { ClientSession } from '../../../common/mongo';
import { MongoTmpData } from '../../tmpData/schema';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';

const myModelsCacheFilter = {
  dataId: { $regex: new RegExp(`^${TmpDataEnum.MyModels}--`) }
};

/** 删除团队下所有成员的模型权限缓存；权限写入成功后无需主动重建。 */
export const clearMyModelsCache = ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) =>
  MongoTmpData.deleteMany(
    {
      $or: [
        { dataId: { $regex: new RegExp(`^${TmpDataEnum.MyModels}--${String(teamId)}--`) } },
        {
          ...myModelsCacheFilter,
          'data.teamId': teamId
        }
      ]
    },
    { session }
  );

/** 模型新增、启用、停用或删除后，删除所有成员的模型列表缓存。 */
export const clearAllMyModelsCache = ({ session }: { session?: ClientSession } = {}) =>
  MongoTmpData.deleteMany(myModelsCacheFilter, { session });
