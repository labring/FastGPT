import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetModelTemplatesQuerySchema,
  GetModelTemplatesResponseSchema,
  type GetModelTemplatesQuery,
  type GetModelTemplatesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelTemplatesQuery>
): Promise<GetModelTemplatesResponse> {
  const { provider, type, search } = parseApiInput({
    req,
    querySchema: GetModelTemplatesQuerySchema
  }).query;

  await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  let templates = global.modelTemplateCache || [];

  if (provider) templates = templates.filter((t) => t.provider === provider);
  if (type) templates = templates.filter((t) => t.type === type);
  if (search) {
    const s = search.toLowerCase();
    templates = templates.filter(
      (t) => t.name.toLowerCase().includes(s) || t.model.toLowerCase().includes(s)
    );
  }

  return GetModelTemplatesResponseSchema.parse({
    templates: templates.map((t) => ({
      provider: t.provider,
      type: t.type,
      model: t.model,
      name: t.name,
      avatar: t.avatar,
      defaultConfig: 'defaultConfig' in t ? t.defaultConfig : undefined,
      fieldMap: 'fieldMap' in t ? t.fieldMap : undefined,
      maxContext: 'maxContext' in t ? t.maxContext : undefined,
      maxResponse: 'maxResponse' in t ? t.maxResponse : undefined,
      vision: 'vision' in t ? t.vision : undefined,
      functionCall: 'functionCall' in t ? t.functionCall : undefined,
      reasoning: 'reasoning' in t ? t.reasoning : undefined,
      toolChoice: 'toolChoice' in t ? t.toolChoice : undefined,
      voices: 'voices' in t ? t.voices : undefined
    }))
  });
}

export default NextAPI(handler);
