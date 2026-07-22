import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { DispatchSubAppResponse } from '../../type';
import { getFileContentByUrl } from '../../../../../../chat/fileContext';
import { getWorkflowFileContext } from '../../../../../utils/context';

type FileReadParams = {
  files: { name?: string; url: string }[];

  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
};

/**
 * 使用聊天文件的统一读取链路解析 Agent 文件，并保留用户上传时的文件名用于响应展示。
 */
export const dispatchFileRead = async ({
  files,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: FileReadParams): Promise<DispatchSubAppResponse> => {
  try {
    const readFilesResult = await Promise.all(
      files.map(async ({ url, name: inputName }) => {
        try {
          const { name, content } = await getFileContentByUrl({
            url,
            teamId,
            tmbId,
            customPdfParse,
            usageId,
            fileContext: getWorkflowFileContext(),
            validateExternalUrlDomain: false
          });

          return {
            url,
            name: inputName ?? name,
            content
          };
        } catch (error) {
          return {
            url,
            name: inputName ?? '',
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
        moduleName: i18nT('chat:read_file'),
        readFiles: files.map((file, index) => ({
          name: readFilesResult[index]!.name,
          url: file.url
        }))
      }
    };
  } catch (error) {
    return {
      response: `Failed to read file: ${getErrText(error)}`,
      usages: []
    };
  }
};
