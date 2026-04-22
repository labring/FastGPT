import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getFileContentFromLinks } from '../workflow/dispatch/tools/readFiles';
import { cloneDeep } from 'lodash';

export const addPreviewUrlToChatItems = async (
  histories: ChatItemMiniType[],
  type: 'chatFlow' | 'workflowTool'
) => {
  async function addToChatflow(item: ChatItemMiniType) {
    for await (const value of item.value) {
      if ('file' in value && value.file && value.file.key) {
        const { url } = await s3ChatSource.createGetChatFileURL({
          key: value.file.key,
          external: true
        });
        value.file.url = url;
      }
    }
  }

  async function addToWorkflowTool(item: ChatItemMiniType) {
    if (item.obj !== ChatRoleEnum.Human || !Array.isArray(item.value)) return;

    for (let j = 0; j < item.value.length; j++) {
      const value = item.value[j];
      if (!('text' in value)) continue;
      const inputValueString = value.text?.content || '';
      const parsedInputValue = JSON.parse(inputValueString) as FlowNodeInputItemType[];

      for (const input of parsedInputValue) {
        if (
          input.renderTypeList[0] !== FlowNodeInputTypeEnum.fileSelect ||
          !Array.isArray(input.value)
        )
          continue;

        for (const file of input.value) {
          if (!file.key) continue;
          const { url } = await getS3ChatSource().createGetChatFileURL({
            key: file.key,
            external: true
          });
          file.url = url;
        }
      }

      item.value[j].text = {
        ...value.text,
        content: JSON.stringify(parsedInputValue)
      };
    }
  }

  // Presign file urls
  const s3ChatSource = getS3ChatSource();
  for await (const item of histories) {
    if (type === 'chatFlow') {
      await addToChatflow(item);
    } else if (type === 'workflowTool') {
      await addToWorkflowTool(item);
    }
  }
};

// Presign variables file urls
export const presignVariablesFileUrls = async ({
  variables,
  variableConfig
}: {
  variables?: Record<string, any>;
  variableConfig?: VariableItemType[];
}) => {
  if (!variables || !variableConfig) return variables;

  const cloneVars = cloneDeep(variables);
  await Promise.all(
    variableConfig.map(async (item) => {
      if (item.type === VariableInputEnum.file) {
        const val = cloneVars[item.key];
        if (Array.isArray(val)) {
          cloneVars[item.key] = await Promise.all(
            val.map(async (item) => {
              if (!item.key) return item;

              const { url } = await getS3ChatSource().createGetChatFileURL({
                key: item.key,
                external: true
              });

              return {
                ...item,
                url
              };
            })
          ).then((urls) => urls.filter(Boolean));
        }
      }
    })
  );

  return cloneVars;
};

export const enrichUserContentWithParsedFiles = async ({
  userContent,
  requestOrigin,
  maxFiles,
  customPdfParse,
  teamId,
  tmbId
}: {
  userContent: UserChatItemType;
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  teamId: string;
  tmbId: string;
}) => {
  const urls = Array.from(
    new Set(
      userContent.value
        .filter(
          (item) => item.file?.type === ChatFileTypeEnum.file && typeof item.file.url === 'string'
        )
        .map((item) => item.file?.url?.trim() || '')
        .filter(Boolean)
    )
  );

  if (urls.length === 0) {
    return userContent;
  }

  const { text } = await getFileContentFromLinks({
    urls,
    requestOrigin,
    maxFiles,
    customPdfParse,
    teamId,
    tmbId
  }).catch(() => {
    return {
      text: '',
      readFilesResult: []
    };
  });

  if (!text.trim()) {
    return userContent;
  }

  const filePrompt = replaceVariable(getDocumentQuotePrompt(), {
    quote: text
  });

  if (!filePrompt) {
    return userContent;
  }

  const enrichedUserContent = cloneDeep(userContent);
  const firstTextItem = enrichedUserContent.value.find((item) => item.text);
  if (firstTextItem?.text) {
    firstTextItem.text.content = [firstTextItem.text.content, filePrompt]
      .filter(Boolean)
      .join('\n\n===---===---===\n\n');
  } else {
    enrichedUserContent.value.push({
      text: {
        content: filePrompt
      }
    });
  }

  return enrichedUserContent;
};
