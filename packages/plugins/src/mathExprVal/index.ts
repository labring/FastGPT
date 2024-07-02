import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Parser } from 'expr-eval';

type Props = {
  expr: string;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
}>;

const main = async ({ expr }: Props): Response => {
  const parser = new Parser();
  const exprParser = parser.parse(expr);

  return {
    result: exprParser.evaluate()
  };
};

export default main;
