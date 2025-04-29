import { z } from 'zod';
import { InputType, tool } from './src';

const main = async (props: z.infer<typeof InputType>) => {
  try {
    const output = await tool(InputType.parse(props));
    return {
      output
    };
  } catch (err) {
    return { error: err };
  }
};

export { InputType, OutputType } from './src';
export default main;
