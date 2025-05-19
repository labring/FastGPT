import React from 'react';
import { ModalBody, Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.tools;

const ContextModal = ({ onClose, dataId }: { onClose: () => void; dataId: string }) => {
  const { getHistoryResponseData } = useContextSelector(ChatBoxContext, (v) => v);
  const { t } = useTranslation();
  const { loading: isLoading, data: contextModalData } = useRequest2(
    () =>
      getHistoryResponseData({ dataId }).then((res) => {
        const flatResData: ChatHistoryItemResType[] =
          res
            ?.map((item) => {
              return [
                item,
                ...(item.pluginDetail || []),
                ...(item.toolDetail || []),
                ...(item.loopDetail || [])
              ];
            })
            .flat() || [];
        return flatResData.find(isLLMNode)?.historyPreview || [];
      }),
    { manual: false }
  );
  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      isLoading={isLoading}
      iconSrc="/imgs/modal/chatHistory.svg"
      title={t('chat:contextual_preview', { num: contextModalData?.length || 0 })}
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
        {contextModalData?.map((item, i) => (
          <Box
            key={i}
            p={2}
            borderRadius={'md'}
            border={'base'}
            _notLast={{ mb: 2 }}
            position={'relative'}
            bg={i % 2 === 0 ? 'white' : 'myGray.50'}
          >
            <Box fontWeight={'bold'}>{item.obj}</Box>
            <Box>{item.value}</Box>
          </Box>
        ))}
      </ModalBody>
    </MyModal>
  );
};

export default ContextModal;
