import React, { useState } from 'react';
import { ModalBody, Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import { DispatchNodeResponseType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.tools;

const ContextModal = ({
  onClose,
  dataId,
  historyPreviewLength
}: {
  onClose: () => void;
  dataId: string;
  historyPreviewLength?: number;
}) => {
  const [contextModalData, setContextModalData] =
    useState<DispatchNodeResponseType['historyPreview']>();
  const { appId, chatId, getHistoryResponseData } = useContextSelector(ChatBoxContext, (v) => v);

  const { loading: isLoading } = useRequest2(() => getHistoryResponseData(appId, dataId, chatId), {
    manual: false,
    onSuccess: (res) => {
      const flatResData: ChatHistoryItemResType[] =
        res
          ?.map((item) => {
            if (item.pluginDetail || item.toolDetail) {
              return [item, ...(item.pluginDetail || []), ...(item.toolDetail || [])];
            }
            return item;
          })
          .flat() || [];
      setContextModalData(flatResData.find(isLLMNode)?.historyPreview || []);
    }
  });
  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/chatHistory.svg"
      title={`上下文预览(${historyPreviewLength || 0}条)`}
      h={['90vh', '80vh']}
      minW={['90vw', '600px']}
      isCentered
    >
      <ModalBody
        whiteSpace={'pre-wrap'}
        textAlign={'justify'}
        wordBreak={'break-all'}
        fontSize={'sm'}
      >
        <MyBox width={'100%'} height={'100%'} isLoading={isLoading}>
          {contextModalData?.map((item, i) => (
            <Box
              key={i}
              p={2}
              borderRadius={'md'}
              border={'base'}
              _notLast={{ mb: 2 }}
              position={'relative'}
            >
              <Box fontWeight={'bold'}>{item.obj}</Box>
              <Box>{item.value}</Box>
            </Box>
          ))}
        </MyBox>
      </ModalBody>
    </MyModal>
  );
};

export default ContextModal;
