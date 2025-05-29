import type { z } from 'zod';
import type { ToolType } from '@/type';
import config from './config';
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

config.toolId = config.toolId ?? __dirname.split('/').pop()?.split('.').shift();

const tool: ToolType = {
  ...config,
  toolId: config.toolId as string,
  cb: main
};

export default tool;
