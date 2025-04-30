import { format } from 'date-fns';
import { z } from 'zod';

export const InputType = z.object({
  formatStr: z.string().optional()
});

export const OutputType = z.object({
  time: z.string()
});

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const formatStr = props.formatStr || 'yyyy-MM-dd HH:mm:ss';
  return {
    time: format(new Date(), formatStr)
  };
}
