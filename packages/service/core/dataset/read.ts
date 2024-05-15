import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readFileContentFromMongo } from '../../common/file/gridfs/controller';
import { urlsFetch } from '../../common/string/cheerio';
import { rawTextBackupPrefix } from '@fastgpt/global/core/dataset/read';
import { parseCsvTable2Chunks } from './training/utils';
import { TextSplitProps, splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import axios from 'axios';
import { readFileRawContent } from '../../common/file/read/utils';

export const readFileRawTextByUrl = async ({ teamId, url }: { teamId: string; url: string }) => {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'arraybuffer'
  });
  const extension = url.split('.')?.pop()?.toLowerCase() || '';

  const buffer = Buffer.from(response.data, 'binary');

  const { rawText } = await readFileRawContent({
    extension,
    teamId,
    buffer,
    encoding: 'utf-8'
  });

  return rawText;
};

/* 
    fileId - local file, read from mongo
    link - request
    externalFile = request read
*/
export const readDatasetSourceRawText = async ({
  teamId,
  type,
  sourceId,
  isQAImport,
  selector
}: {
  teamId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  isQAImport?: boolean;
  selector?: string;
}): Promise<string> => {
  if (type === DatasetSourceReadTypeEnum.fileLocal) {
    const { rawText } = await readFileContentFromMongo({
      teamId,
      bucketName: BucketNameEnum.dataset,
      fileId: sourceId,
      isQAImport
    });
    return rawText;
  } else if (type === DatasetSourceReadTypeEnum.link) {
    const result = await urlsFetch({
      urlList: [sourceId],
      selector
    });

    return result[0]?.content || '';
  } else if (type === DatasetSourceReadTypeEnum.externalFile) {
    const rawText = await readFileRawTextByUrl({
      teamId,
      url: sourceId
    });
    return rawText;
  }

  return '';
};

export const rawText2Chunks = ({
  rawText,
  isQAImport,
  chunkLen = 512,
  ...splitProps
}: {
  rawText: string;
  isQAImport?: boolean;
} & TextSplitProps) => {
  if (isQAImport) {
    const { chunks } = parseCsvTable2Chunks(rawText);
    return chunks;
  }

  const { chunks } = splitText2Chunks({
    text: rawText,
    chunkLen,
    ...splitProps
  });

  return chunks.map((item) => ({
    q: item,
    a: ''
  }));
};
