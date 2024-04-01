import { ReadFileByBufferParams, ReadFileResponse } from './type.d';
import { initMarkdownText } from './utils';
import { htmlToMarkdown } from '../../string/markdown';
import { readFileRawText } from './rawText';

export const readHtmlRawText = async (
  params: ReadFileByBufferParams
): Promise<ReadFileResponse> => {
  const { teamId, metadata } = params;
  const { rawText: html } = readFileRawText(params);

  const md = await htmlToMarkdown(html);

  const rawText = await initMarkdownText({
    teamId,
    md,
    metadata
  });

  return {
    rawText
  };
};
