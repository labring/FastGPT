import { z } from 'zod';

export const WecomGetCorpTokenBodySchema = z.object({});

export const WecomGetCorpTokenQuerySchema = z.object({});

export const WecomGetCorpTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number()
});

export type WecomGetCorpTokenBodyType = z.infer<typeof WecomGetCorpTokenBodySchema>;
export type WecomGetCorpTokenQueryType = z.infer<typeof WecomGetCorpTokenQuerySchema>;
export type WecomGetCorpTokenResponseType = z.infer<typeof WecomGetCorpTokenResponseSchema>;
