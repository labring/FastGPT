import React, { useState } from 'react';
import { ModalBody, Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import { getChatResData } from '@/web/core/chat/api';
import { useMount } from 'ahooks';
import { DispatchNodeResponseType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
  const [isLoading, setIsLoading] = useState(true);
  const appId = useContextSelector(ChatBoxContext, (v) => v.appId);
  const chatId = useContextSelector(ChatBoxContext, (v) => v.chatId) || '';
  useMount(async () => {
    const res = await getChatResData({ appId, chatId, dataId });
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
    setIsLoading(false);
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
        {!isLoading &&
          contextModalData &&
          contextModalData.map((item, i) => (
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
        {isLoading && <Box>加载中...</Box>}
      </ModalBody>
    </MyModal>
  );
};

export default ContextModal;
