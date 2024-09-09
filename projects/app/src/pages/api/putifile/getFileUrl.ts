import { NextAPI } from '@/service/middleware/entry';
import { getFileUrl } from './utils';
import { NextApiRequest } from 'next';

/**
 * putifile 临时文件访问地址获取
 */
async function handler(req: NextApiRequest): Promise<string> {
  const { fileId } = req.query;
  if (!fileId) {
    return Promise.reject('fileId is required');
  }
  // 如果fileId是一个数组，取第一个
  const id = Array.isArray(fileId) ? fileId[0] : fileId;
  const fileUrl = await getFileUrl(id);
  return fileUrl;
}

export default NextAPI(handler);
