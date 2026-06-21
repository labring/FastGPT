import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authEnterpriseAdmin } from '@fastgpt/service/support/enterprise/permission';

const StagingSmokeBodySchema = z.object({
  baseUrl: z.string().url().optional()
});

async function handler(req: ApiRequestProps) {
  await authEnterpriseAdmin({ req });
  const { baseUrl: bodyBaseUrl } = parseApiInput({
    req,
    bodySchema: StagingSmokeBodySchema
  }).body;
  const baseUrl = bodyBaseUrl || process.env.FASTGPT_STAGING_BASE_URL;

  if (!baseUrl) {
    return {
      ok: false,
      skipped: true,
      message: 'FASTGPT_STAGING_BASE_URL is not configured.'
    };
  }

  const started = Date.now();
  const url = new URL('/api/common/system/getInitData', baseUrl);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });
  const text = await response.text();
  const latencyMs = Date.now() - started;

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  return {
    ok: response.ok && !!json,
    status: response.status,
    latencyMs,
    url: url.toString(),
    hasJson: !!json
  };
}

export default NextAPI(handler);
