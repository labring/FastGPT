import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  await setupDataset2LinkedList();
  return { success: true };
}

export default NextAPI(handler);

const setupDataset2LinkedList = async () => {
  try {
    // 获取所有集合 ID
    const collections = await MongoDatasetData.distinct('collectionId');

    let processedCollections = 0;
    let totalProcessed = 0;

    // 按集合 ID 分批处理
    for (const collectionId of collections) {
      const items = await MongoDatasetData.find({ collectionId })
        .sort({ chunkIndex: 1, updateTime: -1 })
        .select('_id')
        .lean();

      if (items.length === 0) continue;

      console.log(
        `开始处理集合 ${processedCollections + 1}/${collections.length}，共 ${items.length} 条数据`
      );

      // 使用单个更新操作代替批量更新
      for (let i = 0; i < items.length; i++) {
        const currentId = items[i]._id;
        const nextId = i < items.length - 1 ? items[i + 1]._id : null;

        // 使用单独的更新操作，只设置nextId
        await MongoDatasetData.updateOne({ _id: currentId }, { $set: { nextId } });

        totalProcessed++;

        // 每 100 条打印一次进度
        if ((i + 1) % 100 === 0 || i === items.length - 1) {
          console.log(
            `集合 ${processedCollections + 1}/${collections.length} 进度: ${i + 1}/${items.length}`
          );
        }
      }

      processedCollections++;
      console.log(
        `完成集合 ${processedCollections}/${collections.length}, 总共处理 ${totalProcessed} 条数据`
      );
    }

    console.log('数据集单向链表构建完成');
    return true;
  } catch (error) {
    console.error('构建单向链表失败:', error);
    throw error;
  }
};
