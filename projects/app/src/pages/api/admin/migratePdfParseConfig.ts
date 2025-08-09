import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type NextApiRequest, type NextApiResponse } from 'next';

/**
 * 数据迁移API：将customPdfParse从boolean类型迁移到string类型
 *
 * 使用方法：
 * POST /api/admin/migratePdfParseConfig
 * Body: { defaultParser?: string }
 */

type MigrationResult = {
  datasetCollections: {
    trueToParser: number;
    falseToEmpty: number;
  };
  apps: {
    updated: number;
    details: Array<{
      appId: string;
      oldValue: any;
      newValue: string;
    }>;
  };
};

async function migratePdfParseConfig(defaultParser: string = 'custom'): Promise<MigrationResult> {
  const result: MigrationResult = {
    datasetCollections: {
      trueToParser: 0,
      falseToEmpty: 0
    },
    apps: {
      updated: 0,
      details: []
    }
  };

  try {
    console.log('开始迁移PDF解析配置...');

    // 1. 迁移数据集集合中的customPdfParse字段
    console.log('迁移数据集集合...');

    // 使用原生MongoDB查询来绕过Mongoose类型检查
    const db = MongoDatasetCollection.db;
    const collectionName = MongoDatasetCollection.collection.collectionName;

    // 查找所有customPdfParse为boolean true的记录
    const booleanTrueRecords = await db
      .collection(collectionName)
      .find({
        customPdfParse: { $eq: true }
      })
      .toArray();
    console.log(`找到 ${booleanTrueRecords.length} 条 customPdfParse: true 的记录`);

    // 将true转换为指定的解析器名称
    if (booleanTrueRecords.length > 0) {
      const updateResult = await db
        .collection(collectionName)
        .updateMany({ customPdfParse: { $eq: true } }, { $set: { customPdfParse: defaultParser } });
      result.datasetCollections.trueToParser = updateResult.modifiedCount;
      console.log(`更新了 ${updateResult.modifiedCount} 条记录: true -> '${defaultParser}'`);
    }

    // 查找所有customPdfParse为boolean false的记录
    const booleanFalseRecords = await db
      .collection(collectionName)
      .find({
        customPdfParse: { $eq: false }
      })
      .toArray();

    console.log(`找到 ${booleanFalseRecords.length} 条 customPdfParse: false 的记录`);

    // 将false转换为空字符串
    if (booleanFalseRecords.length > 0) {
      const updateResult = await db
        .collection(collectionName)
        .updateMany({ customPdfParse: { $eq: false } }, { $set: { customPdfParse: '' } });
      result.datasetCollections.falseToEmpty = updateResult.modifiedCount;
      console.log(`更新了 ${updateResult.modifiedCount} 条记录: false -> ''`);
    }

    // 2. 迁移应用配置中的fileSelectConfig.customPdfParse字段
    console.log('迁移应用配置...');

    // 使用原生MongoDB查询来查找应用配置
    const appDb = MongoApp.db;
    const appCollectionName = MongoApp.collection.collectionName;

    // 查找所有包含boolean类型customPdfParse的应用
    const appsWithBooleanPdfParse = await appDb
      .collection(appCollectionName)
      .find({ 'chatConfig.fileSelectConfig.canSelectFile': { $eq: true } })
      .toArray();

    console.log(`找到 ${appsWithBooleanPdfParse.length} 个支持上传文件的应用`);

    for (const app of appsWithBooleanPdfParse) {
      // 从数据库获取的原始值
      const rawValue = app.chatConfig?.fileSelectConfig?.customPdfParse;
      let newValue = '';

      // 处理boolean类型的值
      if (rawValue === true) {
        newValue = defaultParser;
      } else {
        newValue = '';
      }

      await appDb
        .collection(appCollectionName)
        .updateOne(
          { _id: app._id },
          { $set: { 'chatConfig.fileSelectConfig.customPdfParse': newValue } }
        );

      result.apps.updated++;
      result.apps.details.push({
        appId: String(app._id),
        oldValue: rawValue,
        newValue: newValue
      });

      console.log(`更新应用 ${app._id}: ${rawValue} -> '${newValue}'`);
    }

    console.log('迁移完成！');
    return result;
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 验证管理员权限
    await authCert({ req, authRoot: true });
    const parserArray = global.systemEnv.customPdfParse;
    if (parserArray) {
      const { defaultParser = parserArray[0].name } = req.body;
      const result = await migratePdfParseConfig(defaultParser);
      return {
        success: true,
        message: 'PDF解析配置迁移完成',
        data: result
      };
    }
  } catch (error) {
    console.error('API处理失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '迁移失败',
      error: error
    };
  }
}

export default NextAPI(handler);
