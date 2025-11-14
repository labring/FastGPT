import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const addPreviewUrlToChatItems = async (
  histories: ChatItemType[],
  type: 'chatFlow' | 'workflowTool'
) => {
  async function addToChatflow(item: ChatItemType) {
    for await (const value of item.value) {
      if (value.type === ChatItemValueTypeEnum.file && value.file && value.file.key) {
        value.file.url = await s3ChatSource.createGetChatFileURL({
          key: value.file.key,
          external: true
        });
      }
    }
  }
  async function addToWorkflowTool(item: ChatItemType) {
    if (item.obj !== ChatRoleEnum.Human || !Array.isArray(item.value)) return;

    for (let j = 0; j < item.value.length; j++) {
      const value = item.value[j];
      if (value.type !== ChatItemValueTypeEnum.text) continue;
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
          const url = await getS3ChatSource().createGetChatFileURL({
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
