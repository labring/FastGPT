import type { NextApiRequest, NextApiResponse } from 'next';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { prepareOpenApiUnionPresentation } from '@fastgpt/global/openapi/unionPresentation';

const document = prepareOpenApiUnionPresentation(openAPIDocument);

/** 返回实例端 Dev API 契约 JSON，并显式附加防索引响应头。 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).json(document);
}
