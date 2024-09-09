import { NextAPI } from '@/service/middleware/entry';
import { listTags, PutifileSTagItemResp } from './utils';

/**
 * putifile 标签列表获取
 */
async function handler(): Promise<PutifileSTagItemResp[]> {
  const tags = await listTags();
  return tags;
}

export default NextAPI(handler);
