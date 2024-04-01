import { markdownProcess } from '@fastgpt/global/common/string/markdown';
import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { addHours } from 'date-fns';

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
