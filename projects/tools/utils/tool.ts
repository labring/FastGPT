import type { z } from 'zod';
import type { ToolConfigType, ToolSetConfigType, ToolType } from '@/type';

export const exportTool = ({
  toolCb,
  InputType,
  config
}: {
  toolCb: (props: z.infer<typeof InputType>) => Promise<unknown>;
  InputType: z.AnyZodObject;
  config: ToolConfigType;
}) => {
  const cb = async (props: z.infer<typeof InputType>) => {
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
    cb
  };
  return tool;
};

export const exportToolSet = ({ config }: { config: ToolSetConfigType }) => {
  config.toolId = config.toolId ?? __dirname.split('/').pop()?.split('.').shift();
  config.children.forEach((child) => {
    child.toolId = config.toolId + '/' + child.toolId;
  });

  return {
    ...config
  };
};
