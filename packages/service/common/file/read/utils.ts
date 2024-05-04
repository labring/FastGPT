import { markdownProcess, simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { addHours } from 'date-fns';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import { ReadFileResponse } from '../../../worker/file/type';

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
  csvFormat,
  teamId,
  buffer,
  encoding,
  metadata
}: {
  csvFormat?: boolean;
  extension: string;
  teamId: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
}) => {
  const result = await runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
    extension,
    csvFormat,
    encoding,
    buffer
  });

  // markdown data format
  if (['md', 'html', 'docx'].includes(extension)) {
    result.rawText = await initMarkdownText({
      teamId: teamId,
      md: result.rawText,
      metadata: metadata
    });
  }

  return result;
};

export const htmlToMarkdown = async (html?: string | null) => {
  const md = await runWorker<string>(WorkerNameEnum.htmlStr2Md, { html: html || '' });

  return simpleMarkdownText(md);
};
