import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import ChatController, { type ChatControllerProps } from '../ChatController';
import { ChatBoxContext } from '../../Provider';
import { useContextSelector } from 'use-context-selector';
import { ChatTypeEnum } from '../../constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '../../type';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useSandboxEditor, useSandboxOpenGuard } from '@/pageComponents/chat/SandboxEditor/hook';
import { WorkflowRuntimeContext } from '../../../context/workflowRuntimeContext';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getFlatAppResponses } from '@fastgpt/global/core/chat/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { toChatApiTarget } from '@/web/core/chat/utils';

type AIChatBubbleActionsProps = {
  chatControllerProps: ChatControllerProps;
  historyItem: ChatSiteItemType;
  questionGuides: string[];
  showWholeResponse: boolean;
  enableSandbox: boolean;
  onOpenWholeModal: () => void;
  durationSeconds: number;
  responseData?: ChatHistoryItemResType[];
};

const footerActionTransition = 'color 180ms ease, transform 180ms ease, filter 180ms ease';

const AIChatBubbleActions = ({
  chatControllerProps,
  historyItem,
  questionGuides,
  showWholeResponse,
  enableSandbox,
  onOpenWholeModal,
  durationSeconds,
  responseData
}: AIChatBubbleActionsProps) => {
  const { t } = useTranslation();
  const { onRetry, feedbackUserName, disableFooterHoverTranslate } = chatControllerProps;
  const footerActionHoverStyle = {
    color: 'primary.600',
    ...(!disableFooterHoverTranslate ? { transform: 'translateY(-1px)' } : {})
  };
  const { isPc } = useSystem();
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showRetry = chatType !== ChatTypeEnum.log && !!onRetry;
  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatTarget = useMemo(() => toChatApiTarget(sourceTarget), [sourceTarget]);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const { useAgentSandbox } = useMemo(
    () => addStatisticalDataToHistoryItem(historyItem),
    [historyItem]
  );
  const canUseAgentSandbox = enableSandbox && !!sourceTarget.sourceId && isPc && useAgentSandbox;
  const { onOpenSandboxModal, SandboxEditorModal } = useSandboxEditor({
    enabled: canUseAgentSandbox,
    chatTarget,
    chatId,
    outLinkAuthData
  });
  const { onOpenSandbox } = useSandboxOpenGuard({
    enabled: canUseAgentSandbox,
    chatTarget,
    chatId,
    outLinkAuthData
  });
  const showPoints = useContextSelector(ChatItemContext, (v) => v.showPoints ?? false);

  const totalPoints = useMemo(() => {
    if (!responseData) return 0;
    const flatResData = getFlatAppResponses(responseData);
    return flatResData.reduce(
      (sum: number, item: ChatHistoryItemResType) => sum + (item.totalPoints || 0),
      0
    );
  }, [responseData]);
  const showTotalPoints = showPoints && totalPoints > 0;
  const badFeedback = historyItem.obj === ChatRoleEnum.AI ? historyItem.userBadFeedback : undefined;
  const isFeedbackRead =
    historyItem.obj === ChatRoleEnum.AI ? historyItem.isFeedbackRead : undefined;
  const showUnreadBadFeedback =
    chatType === ChatTypeEnum.log && !!badFeedback && isFeedbackRead !== true;

  const formattedPoints = useMemo(() => {
    const formatted = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1
    }).format(totalPoints);
    return totalPoints > 0 ? `-${formatted}` : formatted;
  }, [totalPoints]);
  const renderRunDetailAction = () => (
    <Flex
      alignItems={'center'}
      gap={'4px'}
      p={'4px'}
      cursor={'pointer'}
      color={'myGray.400'}
      userSelect={'none'}
      transition={footerActionTransition}
      _hover={footerActionHoverStyle}
      onClick={onOpenWholeModal}
    >
      <MyIcon name={'core/chat/terminal'} w={'16px'} />
      <Box>{t('chat:run_detail')}</Box>
    </Flex>
  );
  const showRunDetailAfterCopy =
    chatControllerProps.footerRunDetailPosition === 'afterCopy' && showWholeResponse;

  return (
    <Box mt={4} maxW={'100%'}>
      <Flex
        alignItems={'center'}
        flexWrap={'wrap'}
        color={'myGray.400'}
        fontSize={'12px'}
        fontWeight={500}
        lineHeight={'24px'}
        whiteSpace={'nowrap'}
        zIndex={1}
      >
        <Flex alignItems={'center'} gap={'4px'}>
          <ChatController
            {...chatControllerProps}
            variant="footer"
            footerAfterCopySlot={showRunDetailAfterCopy ? renderRunDetailAction() : undefined}
          />

          {showRetry && (
            <MyTooltip label={t('common:core.chat.retry')}>
              <MyIcon
                name={'common/retryLight'}
                w={'16px'}
                p={'4px'}
                cursor={'pointer'}
                color={'myGray.400'}
                transition={footerActionTransition}
                _hover={footerActionHoverStyle}
                onClick={onRetry}
              />
            </MyTooltip>
          )}

          {showWholeResponse && !showRunDetailAfterCopy && renderRunDetailAction()}

          {canUseAgentSandbox && (
            <Flex
              alignItems={'center'}
              gap={'4px'}
              p={'4px'}
              cursor={'pointer'}
              color={'myGray.400'}
              userSelect={'none'}
              transition={footerActionTransition}
              _hover={footerActionHoverStyle}
              onClick={() => void onOpenSandbox(onOpenSandboxModal)}
            >
              <MyIcon
                name={'core/chat/monitor'}
                w={'16px'}
                sx={{
                  '& path': {
                    fill: 'currentColor'
                  }
                }}
              />
              <Box>{t('app:use_agent_sandbox')}</Box>
            </Flex>
          )}
        </Flex>

        {durationSeconds > 0 && (
          <>
            <Box display={['none', 'block']} mx={4} h={'14px'} w={'1px'} bg={'myGray.200'} />
            <Box display={['none', 'block']} color={'myGray.400'}>
              {durationSeconds.toFixed(2)} s
            </Box>
          </>
        )}

        {showTotalPoints && (
          <Box display={['none', 'block']} ml={4} color={'myGray.400'}>
            {t('common:n_ai_points', { amount: formattedPoints })}
          </Box>
        )}
      </Flex>

      {showUnreadBadFeedback && (
        <Flex
          mt={4}
          flexDirection={'column'}
          gap={'8px'}
          maxW={'100%'}
          border={'1px solid'}
          borderColor={'myGray.250'}
          borderRadius={'8px'}
          p={'12px'}
          whiteSpace={'pre-wrap'}
        >
          <Box fontSize={'10px'} lineHeight={'14px'} color={'myGray.500'}>
            {feedbackUserName || t('chat:log.feedback.user_bad_feedback')}
          </Box>
          <Box fontSize={'12px'} lineHeight={'18px'} color={'myGray.900'}>
            {badFeedback}
          </Box>
        </Flex>
      )}

      {questionGuides.length > 0 && (
        <Flex mt={4} flexDirection={'column'} alignItems={'flex-start'} gap={'8px'}>
          {questionGuides.map((text) => (
            <Flex
              key={text}
              alignItems={'center'}
              gap={2}
              maxW={'100%'}
              px={['16px', '8px']}
              py={['8px', '4px']}
              borderRadius={'8px'}
              border={'0.5px solid'}
              borderColor={['myGray.250', 'transparent']}
              bg={'transparent'}
              color={'myGray.600'}
              fontSize={'14px'}
              lineHeight={'20px'}
              fontWeight={500}
              cursor={'pointer'}
              _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
              onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
            >
              <MyIcon name={'common/arrowRight'} w={'14px'} transform={'rotate(-45deg)'} />
              <Box className="textEllipsis">{text}</Box>
            </Flex>
          ))}
        </Flex>
      )}

      {canUseAgentSandbox && <SandboxEditorModal />}
    </Box>
  );
};

export default React.memo(AIChatBubbleActions);
