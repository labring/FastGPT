import { App } from '../mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { AppSchema } from '@/types/mongoSchema';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

// 模型使用权校验
export const authApp = async ({
  appId,
  userId,
  authUser = true,
  authOwner = true
}: {
  appId: string;
  userId: string;
  authUser?: boolean;
  authOwner?: boolean;
}) => {
  // 获取 app 数据
  const app = await App.findById<AppSchema>(appId);
  if (!app) {
    return Promise.reject('App is not exists');
  }

  /* 
    Access verification
    1. authOwner=true or authUser = true ,  just owner can use
    2. authUser = false and share, anyone can use
  */
  if (authOwner || authUser) {
    if (userId !== String(app.userId)) return Promise.reject(ERROR_ENUM.unAuthModel);
  }

  return {
    app,
    showModelDetail: userId === String(app.userId)
  };
};

// 知识库操作权限
export const authDataset = async ({ datasetId, userId }: { datasetId: string; userId: string }) => {
  const dataset = await MongoDataset.findOne({
    _id: datasetId,
    userId
  });
  if (dataset) {
    return dataset;
  }
  return Promise.reject(ERROR_ENUM.unAuthDataset);
};
