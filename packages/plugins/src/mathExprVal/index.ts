import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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
    return Promise.reject('expr must be a string');
  }

  const parser = new Parser();
  const exprParser = parser.parse(replaceSpecialChar(expr));

  return {
    result: exprParser.evaluate()
  };
};

export default main;