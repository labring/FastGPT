/**
 * v4.14.7 数据迁移脚本
 *
 * 迁移内容：
 * 1. apiDatasetServer.feishuServer -> pluginDatasetServer { pluginId: 'feishu', config }, type -> pluginDataset
 * 2. apiDatasetServer.yuqueServer -> pluginDatasetServer { pluginId: 'yuque', config }, type -> pluginDataset
 * 3. apiDatasetServer.apiServer -> pluginDatasetServer { pluginId: 'custom-api', config }, type -> pluginDataset
 * 4. feConfigs.show_dataset_feishu/yuque -> system_plugin_datasets.status
 */

import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoSystemPluginDataset } from '@fastgpt/service/core/dataset/pluginDataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

async function handler(req: ApiRequestProps) {
  await authCert({ req, authRoot: true });

  // 1. 迁移飞书知识库
  const feishu = await MongoDataset.collection.updateMany(
    { 'apiDatasetServer.feishuServer': { $exists: true }, pluginDatasetServer: { $exists: false } },
    [
      {
        $set: {
          type: DatasetTypeEnum.pluginDataset,
          pluginDatasetServer: { pluginId: 'feishu', config: '$apiDatasetServer.feishuServer' }
        }
      }
    ]
  );

  // 2. 迁移语雀知识库
  const yuque = await MongoDataset.collection.updateMany(
    { 'apiDatasetServer.yuqueServer': { $exists: true }, pluginDatasetServer: { $exists: false } },
    [
      {
        $set: {
          type: DatasetTypeEnum.pluginDataset,
          pluginDatasetServer: { pluginId: 'yuque', config: '$apiDatasetServer.yuqueServer' }
        }
      }
    ]
  );

  // 3. 迁移 API 文件库
  const customApi = await MongoDataset.collection.updateMany(
    { 'apiDatasetServer.apiServer': { $exists: true }, pluginDatasetServer: { $exists: false } },
    [
      {
        $set: {
          type: DatasetTypeEnum.pluginDataset,
          pluginDatasetServer: { pluginId: 'custom-api', config: '$apiDatasetServer.apiServer' }
        }
      }
    ]
  );

  // 4. 迁移 feConfigs 配置
  const feConfigs = global.feConfigs as Record<string, any> | undefined;
  if (feConfigs?.show_dataset_feishu !== undefined) {
    await MongoSystemPluginDataset.updateOne(
      { sourceId: 'feishu' },
      { $set: { status: feConfigs.show_dataset_feishu ? 1 : 0 } },
      { upsert: true }
    );
  }
  if (feConfigs?.show_dataset_yuque !== undefined) {
    await MongoSystemPluginDataset.updateOne(
      { sourceId: 'yuque' },
      { $set: { status: feConfigs.show_dataset_yuque ? 1 : 0 } },
      { upsert: true }
    );
  }

  return {
    feishu: feishu.modifiedCount,
    yuque: yuque.modifiedCount,
    customApi: customApi.modifiedCount
  };
}

export default NextAPI(handler);
