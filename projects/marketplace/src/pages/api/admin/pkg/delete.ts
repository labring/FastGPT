import type { NextApiRequest, NextApiResponse } from 'next';
import { AUTH_TOKEN } from '@/service/auth';
import { deleteMarketplacePkg } from '@/service/tool/delete';
import {
  DeleteMarketplacePkgBodySchema,
  DeleteMarketplacePkgResponseSchema,
  type DeleteMarketplacePkgResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';

/* ============================================================================
 * API: 删除 marketplace 插件 pkg
 * Route: POST /api/admin/pkg/delete
 * Method: POST
 * Description: 手动删除指定来源下某个插件版本的 marketplace 记录及存储文件
 * Tags: ['Plugin', 'Marketplace', 'Admin', 'Delete']
 * ============================================================================ */

export type DeleteMarketplacePkgResponse = DeleteMarketplacePkgResponseType;

const sendJson = (res: NextApiResponse, code: number, data: unknown, message?: string) => {
  res.status(code).json(
    message
      ? {
          code,
          message
        }
      : {
          code,
          data
        }
  );
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, null, 'Method not allowed');
    }

    if (!!AUTH_TOKEN && req.headers['authorization'] !== `Bearer ${AUTH_TOKEN}`) {
      return sendJson(res, 401, null, 'Unauthorized');
    }

    const data = DeleteMarketplacePkgBodySchema.parse(req.body);
    const response = await deleteMarketplacePkg(data);

    return sendJson(res, 200, DeleteMarketplacePkgResponseSchema.parse(response));
  } catch (error) {
    return sendJson(
      res,
      500,
      null,
      error instanceof Error ? error.message : 'Internal Server Error'
    );
  }
}
