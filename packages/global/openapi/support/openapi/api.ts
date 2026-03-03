import { z } from 'zod';

export const ApiKeyHealthParamsSchema = z.object({
  apiKey: z.string().nonempty()
});
export type ApiKeyHealthParamsType = z.infer<typeof ApiKeyHealthParamsSchema>;

export const ApiKeyHealthResponseSchema = z.object({
  appId: z.string().optional().meta({
    description: '如果有关联的应用，会返回应用ID'
  })
});
export type ApiKeyHealthResponseType = z.infer<typeof ApiKeyHealthResponseSchema>;
