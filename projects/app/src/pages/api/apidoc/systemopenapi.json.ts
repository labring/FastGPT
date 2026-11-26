import type { NextApiRequest, NextApiResponse } from 'next';
import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { prepareOpenApiUnionPresentation } from '@fastgpt/global/openapi/unionPresentation';

const document = prepareOpenApiUnionPresentation(apiDocOpenAPIDocument);

/** 返回实例端 System OpenAPI 契约 JSON，并显式附加防索引响应头。 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).json(document);
}
