import { z } from 'zod';
import type { ToolType } from '@/type';
import { config } from './config';
import { InputType, tool as toolCb } from './src';

export const main = async (props: z.infer<typeof InputType>) => {
  try {
    const output = await toolCb(InputType.parse(props));
    return {
      output
    };
  } catch (err) {
    return { error: err };
  }
};

const tool: ToolType = {
  ...config,
  cb: main
};

export default tool;
