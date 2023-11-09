// pages/api/fetchContent.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { FetchResultItem } from '@fastgpt/global/common/plugin/types/pluginRes.d';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { connectToDatabase } from '@/service/mongo';

export type UrlFetchResponse = FetchResultItem[];

const fetchContent = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    await connectToDatabase();
    let { urlList = [] } = req.body as { urlList: string[] };

    if (!urlList || urlList.length === 0) {
      throw new Error('urlList is empty');
    }

    await authCert({ req, authToken: true });

    urlList = urlList.filter((url) => /^(http|https):\/\/[^ "]+$/.test(url));

    const response = (
      await Promise.allSettled(
        urlList.map(async (url) => {
          try {
            const fetchRes = await axios.get(url, {
              timeout: 30000
            });

            const dom = new JSDOM(fetchRes.data, {
              url,
              contentType: 'text/html'
            });

            const reader = new Readability(dom.window.document);
            const article = reader.parse();

            const content = article?.textContent || '';

            return {
              url,
              content: simpleText(`${article?.title}\n${content}`)
            };
          } catch (error) {
            return {
              url,
              content: ''
            };
          }
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
