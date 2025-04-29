import { z } from 'zod';

export const InputType = z.object({
  // TODO
});

export const OutputType = z.object({
  // TODO
});

export async function tool(_props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  // TODO
  return new Date().toLocaleString();
}
