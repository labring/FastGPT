import { Box, Flex } from '@chakra-ui/react';
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
      onClose={onClose}
      isLoading={isLoading}
      size={'xl'}
      h={['90vh', '80vh']}
      maxH={['90vh', '700px']}
      title={
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'20px'} lineHeight={'26px'} letterSpacing={'0.15px'} fontWeight={500}>
            {t('common:core.chat.response.Complete Response')}
          </Box>
          <QuestionTip label={t('chat:question_tip')} />
        </Flex>
      }
    >
      {!isLoading &&
        (!!response?.length ? (
          <ResponseBox response={response} dataId={dataId} />
        ) : (
          <EmptyTip text={t('chat:no_workflow_response')} />
        ))}
    </MyModal>
  );
};

export default WholeResponseModal;
