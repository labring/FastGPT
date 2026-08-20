import z from 'zod';
import { EntityIdSchema } from '../../../../../db/types';

export const CreateOrgSchema = z.object({
  teamId: EntityIdSchema,
  name: z.string(),
  path: z.string()
});
export type CreateOrg = z.infer<typeof CreateOrgSchema>;
