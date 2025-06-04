import { defineInputSchema } from '@/type';
import { z } from 'zod';
import { Parser } from 'expr-eval';

export const InputType = defineInputSchema(
  z.object({
    数学表达式: z.string()
  })
);

export const OutputType = z.object({
  result: z.string()
});

const replaceSpecialChar = (expr: string) => {
  // replace ** to ^
  let result = expr.replace(/\*\*/g, '^');
  return result;
};

export async function tool({
  数学表达式: expr
}: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  if (typeof expr !== 'string') {
    return {
      result: `${expr} is not a string`
    };
  }

  try {
    const parser = new Parser();
    const exprParser = parser.parse(replaceSpecialChar(expr));

    return {
      result: exprParser.evaluate()
    };
  } catch (error) {
    return {
      result: `${expr} is not a valid math expression. Error: ${error}`
    };
  }
}
