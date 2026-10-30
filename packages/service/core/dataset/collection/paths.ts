import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '../../../common/mongo';
import { getFolderParentPathItems } from '../../../common/parentFolder/ancestorIds';
import { MongoDatasetCollection } from './schema';

/**
 * 查询同一团队和知识库内的面包屑，包含当前资源；环、断链或超深路径会被截断。
 * 审计更新可传入 session，让祖先目录与集合属性共用同一事务快照。
 */
export async function getDatasetCollectionPaths({
  parentId = '',
  teamId,
  datasetId,
  session
}: {
  parentId?: string;
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}): Promise<ParentTreePathItemType[]> {
  return getFolderParentPathItems({
    folderId: parentId || null,
    findFolder: (id) =>
      MongoDatasetCollection.findOne(
        {
          _id: id,
          teamId,
          datasetId,
          // 当前资源可为文件，其余祖先只能是文件夹。
          ...(id === parentId ? {} : { type: DatasetCollectionTypeEnum.folder })
        },
        'name parentId',
        { session }
      ).lean()
  });
}
