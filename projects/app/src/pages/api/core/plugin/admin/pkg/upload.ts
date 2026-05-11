import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { multer } from '@fastgpt/service/common/file/multer';
import {
  PLUGIN_BASE_URL,
  PLUGIN_TOKEN
} from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { MarketplaceOfficialSource } from '@fastgpt/global/openapi/core/plugin/marketplace/api';

export const config = {
  api: {
    bodyParser: false
  }
};

const buildPluginApiUrl = (path: string) => {
  const baseUrl = PLUGIN_BASE_URL.endsWith('/') ? PLUGIN_BASE_URL.slice(0, -1) : PLUGIN_BASE_URL;
  return `${baseUrl}${path}`;
};

const uploadOfficialPlugin = async (file: Blob, filename: string) => {
  const formData = new FormData();
  formData.append('file', file, filename);
  formData.append(
    'data',
    JSON.stringify({
      source: MarketplaceOfficialSource
    })
  );

  const response = await fetch(buildPluginApiUrl('/api/plugin/upload'), {
    method: 'POST',
    headers: {
      ...(PLUGIN_TOKEN ? { Authorization: `Bearer ${PLUGIN_TOKEN}` } : {})
    },
    body: formData
  });
  const payload = await response.json().catch(() => undefined);

  if (!response.ok || payload?.error || payload?.message) {
    const reason = payload?.error?.reason ?? payload?.error ?? payload?.message ?? response.statusText;
    throw new Error(
      typeof reason === 'string'
        ? reason
        : JSON.stringify({
            reason
          })
    );
  }

  return payload?.data ?? payload;
};

const parseUploadError = (error: unknown, lang: string) => {
  if (!(error instanceof Error)) return error;

  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.reason) {
      return parseI18nString(parsed.reason, lang) || error.message;
    }
  } catch {
    return error.message;
  }

  return error.message;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const lang = getLocale(req);
  const filepaths: string[] = [];

  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    await authSystemAdmin({ req });

    const result = await multer.resolveFormData<Record<string, never>>({
      request: req
    });

    filepaths.push(result.fileMetadata.path);

    const fileBuffer = result.getBuffer();
    const filename = decodeURIComponent(result.fileMetadata.originalname || 'plugin.pkg');
    const file = new Blob([new Uint8Array(fileBuffer)], {
      type: result.fileMetadata.mimetype
    });

    try {
      const uploadResult = await uploadOfficialPlugin(file, filename);
      return jsonRes(res, {
        code: 200,
        data: uploadResult
      });
    } catch (error: any) {
      return jsonRes(res, {
        code: 400,
        error: parseUploadError(error, lang)
      });
    }
  } catch (error: unknown) {
    return jsonRes(res, {
      code: 500,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}
