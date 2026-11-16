import { Box, CloseButton, Flex, usePrefersReducedMotion } from '@chakra-ui/react';
import { useState } from 'react';
import FullscreenButton from '@/components/common/FullscreenButton';
import { useContextSelector } from 'use-context-selector';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { ChatBoxContext } from '../../ChatContainer/ChatBox/Provider';
import { ResponseBox } from './ResponseBox';

export { ResponseBox } from './ResponseBox';
export { WholeResponseContent } from './WholeResponseContent';

const WholeResponseModal = ({ onClose, dataId }: { onClose: () => void; dataId: string }) => {
  const { t } = useSafeTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { getHistoryResponseData } = useContextSelector(ChatBoxContext, (v) => v);
  const { loading: isLoading, data: response } = useRequest(
    () => getHistoryResponseData({ dataId }),
    {
      manual: false
    }
  );

  return (
    <MyModal
      isCentered
      isOpen={true}
      onClose={isFullscreen ? () => setIsFullscreen(false) : onClose}
      showCloseButton={false}
      isLoading={isLoading}
      size={'xl'}
      w={isFullscreen ? 'calc(100vw - 32px)' : ['90vw', '880px']}
      maxW={isFullscreen ? 'calc(100vw - 32px)' : ['90vw', '880px']}
      h={isFullscreen ? 'calc(100vh - 32px)' : ['90vh', '80vh']}
      maxH={isFullscreen ? 'calc(100vh - 32px)' : ['90vh', '80vh']}
      sx={{
        transition: prefersReducedMotion
          ? 'none'
          : 'width 200ms ease, height 200ms ease, max-width 200ms ease, max-height 200ms ease'
      }}
      headerStyles={{
        px: [5, 8],
        pt: [6, 8]
      }}
      bodyStyles={{
        px: [5, 8],
        pt: [4, 6],
        pb: [5, 8]
      }}
      title={
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'20px'} lineHeight={'26px'} letterSpacing={'0.15px'} fontWeight={500}>
            {t('chat:response.complete_response')}
          </Box>
          <QuestionTip label={t('chat:response.question_tip')} />
          <Flex position={'absolute'} top={3} right={3} alignItems={'center'} gap={1}>
            <FullscreenButton
              isFullscreen={isFullscreen}
              onClick={() => setIsFullscreen((value) => !value)}
            />
            <CloseButton size={'sm'} aria-label={t('common:Close')} onClick={onClose} />
          </Flex>
        </Flex>
      }
    >
      {!isLoading &&
        (!!response?.length ? (
          <ResponseBox response={response} dataId={dataId} />
        ) : (
          <EmptyTip text={t('chat:response.no_workflow_response')} />
        ))}
    </MyModal>
  );
};

export default WholeResponseModal;
