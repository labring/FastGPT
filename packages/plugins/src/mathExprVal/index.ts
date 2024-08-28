import { Parser } from 'expr-eval';

type Props = {
  expr: string;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
}>;

const replaceSpecialChar = (expr: string) => {
  // replace ** to ^
  let result = expr.replace(/\*\*/g, '^');
  return result;
};

const main = async ({ expr }: Props): Response => {
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
};

export default main;
