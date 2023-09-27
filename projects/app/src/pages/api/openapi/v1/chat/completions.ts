import type { NextApiRequest, NextApiResponse } from 'next';
import { withNextCors } from '@/service/utils/tools';
import ChatCompletion from '@/pages/api/v1/chat/completions';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  return ChatCompletion(req, res);
});
