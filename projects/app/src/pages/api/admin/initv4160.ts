import z from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { materializeResourcePermissions } from '@fastgpt/service/support/permission/migration/materializeResourcePermissions';

const InitV4160BodySchema = z.object({
  dryRun: BoolSchema.optional().default(true),
  teamId: z.string().optional(),
  batchSize: IntSchema.min(1).max(1000).optional().default(100)
});

const InitV4160ResponseSchema = z.object({
  dryRun: z.boolean(),
  teamCount: z.number().int().nonnegative(),
  resourceCount: z.number().int().nonnegative(),
  updatedResourceCount: z.number().int().nonnegative(),
  skippedResourceCount: z.number().int().nonnegative(),
  errors: z.array(z.string())
});

/** 将所有资源 ACL 物化为完整有效快照，默认仅 dry-run。 */
async function handler(req: ApiRequestProps) {
  await authSystemAdmin({ req });
  const { body } = parseApiInput({ req, bodySchema: InitV4160BodySchema });
  const result = await materializeResourcePermissions(body);
  return InitV4160ResponseSchema.parse(result);
}

export default NextAPI(handler);
