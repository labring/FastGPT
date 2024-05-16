import { markdownProcess, simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { addHours } from 'date-fns';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import { ReadFileResponse } from '../../../worker/file/type';
import { rawTextBackupPrefix } from '@fastgpt/global/core/dataset/read';

export const initMarkdownText = ({
  teamId,
  md,
  metadata
}: {
  md: string;
  teamId: string;
  metadata?: Record<string, any>;
}) =>
  markdownProcess({
    rawText: md,
    uploadImgController: (base64Img) =>
      uploadMongoImg({
        type: MongoImageTypeEnum.collectionImage,
        base64Img,
        teamId,
        metadata,
        expiredTime: addHours(new Date(), 2)
      })
  });

export const readFileRawContent = async ({
  extension,
  isQAImport,
  teamId,
  buffer,
  encoding,
  metadata
}: {
  isQAImport?: boolean;
  extension: string;
  teamId: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
}) => {
  let { rawText, formatText } = await runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
    extension,
    encoding,
    buffer
  });

  // markdown data format
  if (['md', 'html', 'docx'].includes(extension)) {
    rawText = await initMarkdownText({
      teamId: teamId,
      md: rawText,
      metadata: metadata
    });
  }

  if (['csv', 'xlsx'].includes(extension)) {
    // qa data
    if (isQAImport) {
      rawText = rawText || '';
    } else {
      rawText = formatText || '';
    }
  }

  return { rawText };
};

export const htmlToMarkdown = async (html?: string | null) => {
  const md = await runWorker<string>(WorkerNameEnum.htmlStr2Md, { html: html || '' });

  return simpleMarkdownText(md);
};
