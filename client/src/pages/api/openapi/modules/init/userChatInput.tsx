// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { SystemInputEnum } from '@/constants/app';

export type Props = {
  [SystemInputEnum.userChatInput]: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userChatInput } = req.body as Props;
  jsonRes(res, {
    data: {
      userChatInput
    }
  });
}
