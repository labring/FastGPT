// pages/api/fetchContent.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { connectToDatabase } from '@/service/mongo';
import { UrlFetchParams, UrlFetchResponse } from '@fastgpt/global/common/file/api.d';
import { urlsFetch } from '@fastgpt/service/common/string/cheerio';

const fetchContent = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    await connectToDatabase();
    let { urlList = [], selector } = req.body as UrlFetchParams;

    if (!urlList || urlList.length === 0) {
      throw new Error('urlList is empty');
    }

    await authCert({ req, authToken: true });

    jsonRes<UrlFetchResponse>(res, {
      data: await urlsFetch({
        urlList,
        selector
      })
    });
  } catch (error: any) {
    jsonRes(res, {
      code: 500,
      error: error
    });
  }
};

export default fetchContent;
