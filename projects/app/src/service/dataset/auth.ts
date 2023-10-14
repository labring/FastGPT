import { isSpecialFileId } from '@fastgpt/core/dataset/utils';
import { GridFSStorage } from '../lib/gridfs';
import { Types } from '@fastgpt/common/mongo';

export async function authFileIdValid(fileId?: string) {
  if (!fileId) return true;
  if (isSpecialFileId(fileId)) return true;
  try {
    // find file
    const gridFs = new GridFSStorage('dataset', '');
    const collection = gridFs.Collection();
    const file = await collection.findOne(
      { _id: new Types.ObjectId(fileId) },
      { projection: { _id: 1 } }
    );
    if (!file) {
      return Promise.reject('Invalid fileId');
    }
  } catch (error) {
    return Promise.reject('Invalid fileId');
  }
}
