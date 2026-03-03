import { z } from 'zod';

export const WecomGetRedirectURLBodySchema = z.object({
  redirectUri: z.string(),
  state: z.string(),
  isWecomWorkTerminal: z.boolean()
});

export const WecomGetRedirectURLResponseSchema = z.string();

export type WecomGetRedirectURLBodyType = z.infer<typeof WecomGetRedirectURLBodySchema>;
export type WecomGetRedirectURLResponseType = z.infer<typeof WecomGetRedirectURLResponseSchema>;
