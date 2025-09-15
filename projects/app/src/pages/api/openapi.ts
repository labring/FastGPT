import { contract } from '@fastgpt/global/common/tsRest/contract';
import { generateOpenApiDocument, OpenAPIObject } from '@fastgpt/global/common/tsRest/server';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_: NextApiRequest, res: NextApiResponse) => {
  res.json(generateOpenApiDocument(contract));
};

export default handler;
