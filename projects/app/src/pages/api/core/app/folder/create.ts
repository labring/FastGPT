import type { NextApiResponse } from 'next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';

export type CreateAppFolderBody = {
  parentId?: ParentIdType;
  name: string;
  intro?: string;
};

async function handler(req: ApiRequestProps<CreateAppFolderBody>, res: NextApiResponse<any>) {
  const { name, intro, parentId } = req.body;

  if (!name) {
    throw new Error('缺少参数');
  }

  // 凭证校验
  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });

  // Create app
  await MongoApp.create({
    ...parseParentIdInMongo(parentId),
    avatar: FolderImgUrl,
    name,
    intro,
    teamId,
    tmbId,
    type: AppTypeEnum.folder
  });
}

export default NextAPI(handler);
