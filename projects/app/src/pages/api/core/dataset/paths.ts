import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import type { DatasetPathItemType } from '@/types/core/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { parentId } = req.query as { parentId: string };

    jsonRes<DatasetPathItemType[]>(res, {
      data: await getParents(parentId)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

async function getParents(parentId?: string): Promise<DatasetPathItemType[]> {
  if (!parentId) {
    return [];
  }

  const parent = await KB.findById(parentId, 'name parentId');

  if (!parent) return [];

  const paths = await getParents(parent.parentId);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}
