import z from 'zod';

export const TeamChangeOwnerBodySchema = z.object({
  userId: z.string().describe("the New Owner's UserId.")
});

export const TeamChangeOwnerResponseSchema = z.object();

export type TeamChangeOwnerBodyType = z.infer<typeof TeamChangeOwnerBodySchema>;
export type TeamChangeOwnerResponseType = z.infer<typeof TeamChangeOwnerResponseSchema>;
