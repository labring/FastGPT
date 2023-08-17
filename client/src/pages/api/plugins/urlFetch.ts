// pages/api/fetchContent.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';

type FetchResultItem = {
  url: string;
  title: string;
  content: string;
};
export type UrlFetchResponse = FetchResultItem[];

const fetchContent = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { urlList = [] } = req.body as { urlList: string[] };

    if (!urlList || urlList.length === 0) {
      throw new Error('urlList is empty');
    }

    await authUser({ req });

    const response = (
      await Promise.allSettled(
        urlList.map(async (url) => {
          const fetchRes = await axios.get(url, {
            timeout: 30000
          });

          const dom = new JSDOM(fetchRes.data, {
            url,
            contentType: 'text/html'
          });

          const reader = new Readability(dom.window.document);
          const article = reader.parse();

          return {
            url,
            title: article?.title || '',
            content: article?.textContent || ''
          };
        })
      )
    )
      .filter((item) => item.status === 'fulfilled')
      .map((item: any) => item.value)
      .filter((item) => item.content);

    jsonRes<UrlFetchResponse>(res, {
      data: response
    });
  } catch (error: any) {
    jsonRes(res, {
      code: 500,
      error: error
    });
  }
};

export default fetchContent;
