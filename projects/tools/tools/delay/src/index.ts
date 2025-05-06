import { z } from 'zod';

export const InputType = z.object({
  ms: z.number().min(1).max(300000)
});

export const OutputType = z.object({});

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  // delay for ms milliseconds
  await new Promise((resolve) => setTimeout(resolve, props.ms));
  return {};
}
