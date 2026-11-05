import type { NextApiRequest, NextApiResponse } from 'next';
import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { prepareOpenApiUnionPresentation } from '@fastgpt/global/openapi/unionPresentation';

const document = prepareOpenApiUnionPresentation(apiDocOpenAPIDocument);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json(document);
}
