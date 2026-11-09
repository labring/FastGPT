import type { NextApiRequest, NextApiResponse } from 'next';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { prepareOpenApiUnionPresentation } from '@fastgpt/global/openapi/unionPresentation';

const document = prepareOpenApiUnionPresentation(openAPIDocument);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json(document);
}
