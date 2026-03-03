import z from 'zod';

export const PluginGetAccessTokenBodySchema = z.object({
  toolId: z.string(),
  teamId: z.string(),
  tmbId: z.string()
});

export const PluginGetAccessTokenResponseSchema = z.object({
  accessToken: z.string()
});

export type PluginGetAccessTokenBodyType = z.infer<typeof PluginGetAccessTokenBodySchema>;
export type PluginGetAccessTokenResponseType = z.infer<typeof PluginGetAccessTokenResponseSchema>;
