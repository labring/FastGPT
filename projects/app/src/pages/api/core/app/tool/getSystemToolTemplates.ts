import { NextAPI } from '@/service/middleware/entry';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetSystemToolTemplatesBodySchema,
  GetSystemToolTemplatesResponseSchema,
  type GetSystemToolTemplatesBodyType
} from '@fastgpt/global/openapi/core/app/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { listAuthorizedSystemToolTemplates } from '@fastgpt/service/core/app/tool/systemTool/capability';

export type GetSystemPluginTemplatesBody = GetSystemToolTemplatesBodyType;

export async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>
): Promise<NodeTemplateListItemType[]> {
  const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true });
  const {
    body: { tags, parentId, searchKey, source }
  } = parseApiInput({
    req,
    bodySchema: GetSystemToolTemplatesBodySchema
  });
  const lang = getLocale(req);
  return GetSystemToolTemplatesResponseSchema.parse(
    await listAuthorizedSystemToolTemplates({
      teamId,
      tmbId,
      isRoot,
      lang,
      tags,
      parentId: parentId ?? undefined,
      searchKey,
      source
    })
  );
}

export default NextAPI(handler);
