import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import axios from 'axios';
import { connectToDatabase, User, Pay } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { PaySchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    res.send('');
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
