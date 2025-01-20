import { NextAPI } from '@/service/middleware/entry';
import { delay } from '@fastgpt/global/common/system/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { NextApiRequest, NextApiResponse } from 'next';

/* 
  简单版迁移：直接升级到最新镜像，会去除 MongoDatasetData 里的索引。直接执行这个脚本。
  无缝迁移：
    1. 先用 4.8.18-tmp 版本，会同时有 MongoDatasetData 和 MongoDatasetDataText 两个表和索引，依然是 MongoDatasetData 生效。会同步更新两张表数据。
    2. 执行升级脚本，不要删除 MongoDatasetData 里的数据。
    3. 切换正式版镜像，让 MongoDatasetDataText 生效。
    4. 删除 MongoDatasetData 里的索引和多余字段。（4819 再删
    5. 移动 User 表中的 avatar 字段到 TeamMember 表中。
*/
let success = 0;
async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  const batchSize = req.body.batchSize || 500;
  success = 0;

  const start = Date.now();
  await initData(batchSize);
  // await restore();
  console.log('Init data time:', Date.now() - start);

  success = 0;

  // batchUpdateFields();

  return { success: true };
}

export default NextAPI(handler);

const restore = async () => {
  try {
    const data = await MongoDatasetData.findOne({ fullTextToken: { $exists: false } });
    if (!data) return;

    data.fullTextToken = jiebaSplit({ text: `${data.q}\n${data.a}`.trim() });
    await data.save();

    success++;
    console.log('Success:', success);

    await restore();
  } catch (error) {
    console.log(error);
    await delay(500);
    await restore();
  }
};

const initData = async (batchSize: number) => {
  while (true) {
    try {
      // 找到没有初始化的数据
      const dataList = await MongoDatasetData.find(
        {
          initFullText: { $exists: false }
        },
        '_id teamId datasetId collectionId fullTextToken'
      )
        .limit(batchSize)
        .lean();

      if (dataList.length === 0) break;

      try {
        await MongoDatasetDataText.insertMany(
          dataList.map((item) => ({
            teamId: item.teamId,
            datasetId: item.datasetId,
            collectionId: item.collectionId,
            dataId: item._id,
            fullTextToken: item.fullTextToken
          })),
          { ordered: false, lean: true }
        );
      } catch (error: any) {
        if (error.code === 11000) {
          console.log('Duplicate key error');
        } else {
          throw error;
        }
      }

      // 把成功插入的新数据的 dataId 更新为已初始化
      await MongoDatasetData.updateMany(
        { _id: { $in: dataList.map((item) => item._id) } },
        // FullText tmp
        // { $set: { initFullText: true } }
        { $set: { initFullText: true }, $unset: { fullTextToken: 1 } }
      );

      success += dataList.length;
      console.log('Success:', success);

      // await initData(batchSize);
    } catch (error: any) {
      console.log(error, '===');
      await delay(500);
      // await initData(batchSize);
    }
  }
};

// const batchUpdateFields = async (batchSize = 2000) => {
//   // Find documents that still have these fields
//   const documents = await MongoDatasetData.find({ initFullText: { $exists: true } }, '_id')
//     .limit(batchSize)
//     .lean();

//   if (documents.length === 0) return;

//   // Update in batches
//   await MongoDatasetData.updateMany(
//     { _id: { $in: documents.map((doc) => doc._id) } },
//     {
//       $unset: {
//         initFullText: 1
//         // fullTextToken: 1
//       }
//     }
//   );

//   success += documents.length;
//   console.log('Delete success:', success);
//   await batchUpdateFields(batchSize);
// };
