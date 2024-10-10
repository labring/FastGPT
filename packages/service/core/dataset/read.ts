import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readFileContentFromMongo } from '../../common/file/gridfs/controller';
import { urlsFetch } from '../../common/string/cheerio';
import { parseCsvTable2Chunks } from './training/utils';
import { TextSplitProps, splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import axios from 'axios';
import { readRawContentByFileBuffer } from '../../common/file/read/utils';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';

export const readFileRawTextByUrl = async ({
  teamId,
  url,
  relatedId
}: {
  teamId: string;
  url: string;
  relatedId?: string;
}) => {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'arraybuffer'
  });
  const extension = parseFileExtensionFromUrl(url);

  const buffer = Buffer.from(response.data, 'binary');

  const { rawText } = await readRawContentByFileBuffer({
    extension,
    teamId,
    buffer,
    encoding: 'utf-8',
    metadata: {
      relatedId
    }
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
  selector,
  relatedId
}: {
  teamId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  isQAImport?: boolean;
  selector?: string;
  relatedId?: string;
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
      url: sourceId,
      relatedId
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
