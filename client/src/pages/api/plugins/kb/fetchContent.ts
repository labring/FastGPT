// pages/api/fetchContent.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

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
      return res.status(400).json({ error: 'Unable to parse the main content of the page' });
    }

    return res.status(200).json({ content: article.content });
  } catch (error:any) {
    console.error(error);

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return res.status(error.response.status).json({
        error: `Request failed with status code ${error.response.status}`,
      });
    } else if (error.request) {
      // The request was made but no response was received
      return res.status(500).json({
        error: 'No response received from the server',
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      return res.status(500).json({
        error: 'An error occurred while processing the request',
      });
    }
  }
};

export default fetchContent;
