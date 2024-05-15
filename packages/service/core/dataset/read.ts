import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readFileContentFromMongo } from '../../common/file/gridfs/controller';
import { urlsFetch } from '../../common/string/cheerio';
import { rawTextBackupPrefix } from '@fastgpt/global/core/dataset/read';
import { parseCsvTable2Chunks } from './training/utils';
import { TextSplitProps, splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';

/* 
    fileId - local file, read from mongo
    link - request
    externalFile = request read
*/
export const readDatasetSourceRawText = async ({
  teamId,
  type,
  sourceId,
  csvFormat,
  selector
}: {
  teamId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  csvFormat?: boolean;
  selector?: string;
}) => {
  if (type === DatasetSourceReadTypeEnum.fileLocal) {
    const { rawText } = await readFileContentFromMongo({
      teamId,
      bucketName: BucketNameEnum.dataset,
      fileId: sourceId,
      csvFormat
    });
    return rawText;
  } else if (type === DatasetSourceReadTypeEnum.link) {
    const result = await urlsFetch({
      urlList: [sourceId],
      selector
    });

    return result[0]?.content || '';
  } else if (type === DatasetSourceReadTypeEnum.externalFile) {
    return '22';
  }

  return '';
};

export const rawText2Chunks = ({
  rawText,
  isBackup,
  ...splitProps
}: {
  rawText: string;
  isBackup?: boolean;
} & TextSplitProps) => {
  const backupImport = rawText.trim().startsWith(rawTextBackupPrefix) || isBackup;

  if (backupImport) {
    const { chunks } = parseCsvTable2Chunks(rawText);
    return chunks;
  }

  const { chunks } = splitText2Chunks({
    text: rawText,
    ...splitProps
  });

  return chunks.map((item) => ({
    q: item,
    a: ''
  }));
};
