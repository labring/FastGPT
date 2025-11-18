import { replaceVariable } from '@fastgpt/global/common/string/tools';

export const getMultiplePrompt = (obj: {
  fileCount: number;
  imgCount: number;
  question: string;
}) => {
  const prompt = `Number of session file inputs：
Document：{{fileCount}}
Image：{{imgCount}}
------
{{question}}`;
  return replaceVariable(prompt, obj);
};
