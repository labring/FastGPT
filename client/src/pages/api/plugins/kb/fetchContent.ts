// pages/api/fetchContent.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { jsonRes } from '@/service/response';

const fetchContent = async (req: NextApiRequest, res: NextApiResponse) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await axios.get(url, {
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false,
      }),
    });

    const dom = new JSDOM(response.data, {
      url,
      contentType: 'text/html',
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
        jsonRes(res, {
            code: 500,
            error: '页面获取失败或页面为空'
          });
          return;
    }

    jsonRes(res, {
        code: 200,
        data: article.content
      });
    
  } catch (error:any) {
    jsonRes(res, {
        code: 500,
        error: error
      });
    }
  
};

export default fetchContent;
