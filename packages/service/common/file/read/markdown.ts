import { ReadFileByBufferParams, ReadFileResponse } from './type.d';
import { initMarkdownText } from './utils';
import { readFileRawText } from './rawText';

export const readMarkdown = async (params: ReadFileByBufferParams): Promise<ReadFileResponse> => {
  const { teamId, metadata } = params;
  const { rawText: md } = readFileRawText(params);

  const rawText = await initMarkdownText({
    teamId,
    md,
    metadata
  });

  return {
    rawText
  };
};
