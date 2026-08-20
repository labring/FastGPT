import z from 'zod';
import { EntityIdSchema } from '../../../../../db/types';

export const CreateMemberGroupSchema = z.object({
  teamId: EntityIdSchema,
  name: z.string(),
  avatar: z.string().optional()
});
export type CreateMemberGroup = z.infer<typeof CreateMemberGroupSchema>;
