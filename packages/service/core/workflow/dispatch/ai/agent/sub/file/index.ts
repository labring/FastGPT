import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { DispatchSubAppResponse } from '../../type';
import { getFileContentByUrl } from '../../../../../utils/file';

type FileReadParams = {
  files: { id: string; url: string }[];

  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
};

export const dispatchFileRead = async ({
  files,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: FileReadParams): Promise<DispatchSubAppResponse> => {
  try {
    const readFilesResult = await Promise.all(
      files.map(async ({ id, url }) => {
        try {
          const { name, content } = await getFileContentByUrl({
            url,
            teamId,
            tmbId,
            customPdfParse,
            usageId
          });

          return {
            id,
            name,
            content
          };
        } catch (error) {
          return {
            id,
            name: '',
            content: getErrText(error, 'Load file error')
          };
        }
      })
    );

    return {
      response: JSON.stringify(readFilesResult),
      usages: [],
      nodeResponse: {
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: i18nT('chat:read_file')
      }
    };
  } catch (error) {
    return {
      response: `Failed to read file: ${getErrText(error)}`,
      usages: []
    };
  }
};
