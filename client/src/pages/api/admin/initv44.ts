// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, KB } from '@/service/mongo';
import { KbTypeMap } from '@/constants/kb';

const limit = 50;
let success = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

    await initKb();

    jsonRes(res, {});
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function initKb(): Promise<any> {
  try {
    // 找到所有 type 不存在的 kb
    const kbList = await KB.find({ type: { $exists: false } }).limit(limit);

    if (kbList.length === 0) return;

    await Promise.allSettled(
      kbList.map(async (kb) => {
        let id = '';
        try {
          // 创建一组以 kb 的 name，userId 相同文件夹类型的数据
          const result = await KB.create({
            parentId: null,
            userId: kb.userId,
            avatar: KbTypeMap.folder.avatar,
            name: kb.name,
            type: 'folder'
          });
          id = result._id;
          // 将现有的 kb 挂载到这个文件夹下
          await KB.findByIdAndUpdate(kb._id, {
            parentId: result._id,
            type: 'manualData'
          });
          console.log(++success);
        } catch (error) {
          await KB.findByIdAndDelete(id);
        }
      })
    );
    return initKb();
  } catch (error) {
    return initKb();
  }
}
