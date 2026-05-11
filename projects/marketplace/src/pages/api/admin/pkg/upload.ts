import type { NextApiRequest, NextApiResponse } from 'next';
import { multer } from '@fastgpt/service/common/file/multer';
import { AUTH_TOKEN } from '@/service/auth';
import { uploadMarketplacePkg } from '@/service/tool/upload';
import {
  UploadMarketplacePkgDataSchema,
  UploadMarketplacePkgResponseSchema,
  type UploadMarketplacePkgResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';

/* ============================================================================
 * API: 上传 marketplace pkg
 * Route: POST /api/admin/pkg/upload
 * Method: POST
 * Description: 上传插件 pkg,解析必要信息入库,并将 pkg 文件写入对象存储
 * Tags: ['Plugin', 'Marketplace', 'Admin', 'Write']
 * ============================================================================ */

export const config = {
  api: {
    bodyParser: false
  }
};

export type UploadMarketplacePkgResponse = UploadMarketplacePkgResponseType;

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
  const filepaths: string[] = [];

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

    const result = await multer.resolveFormData<Record<string, unknown>>({
      request: req,
      allowedExtensions: ['.pkg']
    });
    filepaths.push(result.fileMetadata.path);

    const data = UploadMarketplacePkgDataSchema.parse(result.data);
    const response = await uploadMarketplacePkg({
      buffer: result.getBuffer(),
      source: data.source
    });

    return sendJson(res, 200, UploadMarketplacePkgResponseSchema.parse(response));
  } catch (error) {
    return sendJson(
      res,
      500,
      null,
      error instanceof Error ? error.message : 'Internal Server Error'
    );
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}
