import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

const baseUrl = process.env.AIPROXY_API_ENDPOINT;
const token = process.env.AIPROXY_API_TOKEN;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authSystemAdmin({ req });

    if (!baseUrl || !token) {
      throw new Error('AIPROXY_API_ENDPOINT or AIPROXY_API_TOKEN is not set');
    }

    const { path = [], ...query } = req.query as any;

    if (!path.length) {
      throw new Error('url is empty');
    }

    const queryStr = new URLSearchParams(query).toString();
    const requestPath = queryStr
      ? `/${path?.join('/')}?${new URLSearchParams(query).toString()}`
      : `/${path?.join('/')}`;

    const parsedUrl = new URL(baseUrl);
    delete req.headers?.cookie;
    delete req.headers?.host;
    delete req.headers?.origin;

    // Select request function based on protocol
    const requestFn = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    const requestResult = requestFn({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: {
        ...req.headers,
        Authorization: `Bearer ${token}`
      },
      timeout: 30000
    });

    req.pipe(requestResult);

    requestResult.on('response', (response) => {
      Object.keys(response.headers).forEach((key) => {
        // @ts-ignore
        res.setHeader(key, response.headers[key]);
      });
      response.statusCode && res.writeHead(response.statusCode);
      response.pipe(res);
    });
    requestResult.on('error', (e) => {
      res.send(e);
      res.end();
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
