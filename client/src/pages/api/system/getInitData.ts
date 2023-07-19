// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';
import type { FeConfigsType } from '@/types';

export type InitDateResponse = {
  beianText: string;
  googleVerKey: string;
  baiduTongji: string;
  chatModels: ChatModelItemType[];
  qaModels: QAModelItemType[];
  vectorModels: VectorModelItemType[];
  feConfigs: FeConfigsType;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const envs = {
    beianText: process.env.SAFE_BEIAN_TEXT || '',
    googleVerKey: process.env.CLIENT_GOOGLE_VER_TOKEN || '',
    baiduTongji: process.env.BAIDU_TONGJI || ''
  };

  jsonRes<InitDateResponse>(res, {
    data: {
      ...envs,
      chatModels: global.chatModels,
      qaModels: global.qaModels,
      vectorModels: global.vectorModels,
      feConfigs: global.feConfigs
    }
  });
}
