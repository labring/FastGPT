// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { SystemInputEnum } from '@/constants/app';
import { ChatItemType } from '@/types/chat';

export type Props = {
  maxContext: number;
  [SystemInputEnum.history]: ChatItemType[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { maxContext = 5, history } = req.body as Props;

  jsonRes(res, {
    data: {
      history: history.slice(-maxContext)
    }
  });
}
