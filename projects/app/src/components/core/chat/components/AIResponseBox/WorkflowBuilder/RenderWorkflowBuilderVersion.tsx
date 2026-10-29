import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Flex, Spinner, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import LikeFeedbackButton from '../../../ChatContainer/ChatBox/components/LikeFeedbackButton';
import { ChatFeedbackContext } from '../../../ChatContainer/context/chatFeedbackContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { useContextSelector } from 'use-context-selector';
import {
  ChatItemContext,
  type WorkflowBuilderVersionActions
} from '@/web/core/chat/context/chatItemContext';
import {
  getWorkflowBuilderVersionDisplayState,
  isWorkflowBuilderVersionExpiredError
} from '@fastgpt/global/core/workflow/builder/utils';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import {
  getWorkflowBuilderVersionButtonState,
  workflowBuilderAppliedFeedbackDuration
} from './utils';

/** 版本卡片独立呈现应用状态，并复用所属消息的反馈；已应用和过期均不限制赞踩。 */
const RenderWorkflowBuilderVersion = ({
  version,
  responseChatItemId
}: {
  version: WorkflowBuilderVersion;
  responseChatItemId: string;
}) => {
  const { t } = useTranslation(['workflow', 'chat']);
  const actions = useContextSelector(
    ChatItemContext,
    (value) => value.workflowBuilderVersionActions
  ) as WorkflowBuilderVersionActions | undefined;
  const feedback = useContextSelector(ChatFeedbackContext, (value) => value);
  const chat = useContextSelector(ChatRecordContext, (value) =>
    value.chatRecords.find(
      (item) => item.obj === ChatRoleEnum.AI && item.dataId === responseChatItemId
    )
  );
  const onLike = chat ? feedback?.onAddUserLike(chat) : undefined;
  const onDislike = chat ? feedback?.onAddUserDislike(chat) : undefined;
  const isFeedbackPending = feedback?.pendingFeedbackIds.includes(responseChatItemId) ?? false;
  const [localAppliedAt, setLocalAppliedAt] = useState<string>();
  // 本地应用结果立即显示；记录被历史刷新或外层应用操作更新时，以最新 props 为准。
  const currentVersion = useMemo(
    () => ({ ...version, appliedAt: version.appliedAt ?? localAppliedAt }),
    [version, localAppliedAt]
  );
  const hasApplied = !!currentVersion.appliedAt;
  const [loading, setLoading] = useState(false);
  const [showApplied, setShowApplied] = useState(false);
  const [runtimeExpired, setRuntimeExpired] = useState(false);
  const appliedResetTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const state = useMemo(
    () =>
      runtimeExpired
        ? 'expired'
        : getWorkflowBuilderVersionDisplayState({ version: currentVersion }),
    [currentVersion, runtimeExpired]
  );
  const buttonState = getWorkflowBuilderVersionButtonState({
    displayState: state,
    loading,
    showApplied
  });

  useEffect(
    () => () => {
      if (appliedResetTimerRef.current) clearTimeout(appliedResetTimerRef.current);
    },
    []
  );

  const run = async (callback: () => Promise<void>) => {
    if (loading || actions?.isApplying) return;
    // 成功提示不阻止再次应用；新请求开始后清除上一次提示，避免失败时仍显示成功。
    if (appliedResetTimerRef.current) clearTimeout(appliedResetTimerRef.current);
    setShowApplied(false);
    setLoading(true);
    try {
      await callback();
    } catch {
      // applyVersion 已统一展示错误或过期提示，版本卡只负责恢复可操作状态。
    } finally {
      setLoading(false);
    }
  };

  const primaryText = (() => {
    if (buttonState === 'expired') return String(t('workflow_builder_version_expired'));
    if (buttonState === 'applied') return String(t('workflow_builder_version_applied'));
    return String(t('workflow_builder_version_apply'));
  })();

  const markExpired = (showToast = true) => {
    setRuntimeExpired(true);
    if (showToast) actions?.notifyVersionExpired();
  };

  const markApplied = () => {
    if (appliedResetTimerRef.current) clearTimeout(appliedResetTimerRef.current);
    setShowApplied(true);
    appliedResetTimerRef.current = setTimeout(() => {
      setShowApplied(false);
      appliedResetTimerRef.current = undefined;
    }, workflowBuilderAppliedFeedbackDuration);
  };

  const apply = () =>
    run(async () => {
      if (!actions) return;
      if (currentVersion.expiresAt && new Date(currentVersion.expiresAt).getTime() <= Date.now()) {
        markExpired();
        return;
      }

      try {
        const appliedVersion = await actions.applyVersion(currentVersion, responseChatItemId);
        setLocalAppliedAt(appliedVersion.appliedAt);
        markApplied();
      } catch (error) {
        if (isWorkflowBuilderVersionExpiredError(error)) {
          markExpired(false);
        }
        throw error;
      }
    });

  const isUnavailable = buttonState === 'expired';
  const buttonBackground =
    buttonState === 'loading' || isUnavailable ? 'rgba(51, 112, 255, 0.30)' : '#3370FF';
  const isActionDisabled = !actions || actions.isApplying || isUnavailable;

  return (
    <Flex
      w="100%"
      h="56px"
      minH="56px"
      alignItems="center"
      gap={2}
      p={3}
      borderWidth="1px"
      borderColor="#E8EBF0"
      borderRadius="8px"
      bg="white"
      maxW="100%"
    >
      <MyIcon
        name="core/app/workflowVersion"
        boxSize="24px"
        flexShrink={0}
        color={hasApplied ? 'myGray.600' : 'primary.600'}
        sx={hasApplied ? { '& path': { fill: 'currentColor' } } : undefined}
      />
      <Flex flex={1} minW={0} alignItems="center" justifyContent="space-between" pr="8px">
        <Text
          minW={0}
          color="myGray.600"
          fontSize="16px"
          lineHeight="24px"
          letterSpacing="0.5px"
          noOfLines={1}
        >
          <Text as="span" color={hasApplied ? 'myGray.600' : '#2B5FD9'}>
            {currentVersion.name}
          </Text>
          {hasApplied
            ? ` ${t('workflow_builder_version_applied')}`
            : t('workflow_builder_version_ready_suffix')}
        </Text>
        {onLike && onDislike && (
          <Flex gap="8px" alignItems="center" flexShrink={0} ml="8px">
            <MyTooltip label={t('chat:feedback_helpful')} shouldWrapChildren={false}>
              <Flex as="span">
                <LikeFeedbackButton
                  w="16px"
                  h="16px"
                  p="4px"
                  isActive={chat?.obj === ChatRoleEnum.AI && !!chat.userGoodFeedback}
                  isDisabled={isFeedbackPending}
                  ariaLabel={t('chat:feedback_helpful')}
                  effectTrigger={
                    feedback?.likeFeedbackEffect?.dataId === responseChatItemId
                      ? feedback.likeFeedbackEffect.trigger
                      : undefined
                  }
                  disableHoverTranslate
                  onClick={onLike}
                />
              </Flex>
            </MyTooltip>
            <MyTooltip label={t('chat:feedback_unhelpful')} shouldWrapChildren={false}>
              <Button
                variant="unstyled"
                w="24px"
                minW="24px"
                h="24px"
                minH="24px"
                p="4px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                borderRadius="6px"
                aria-label={t('chat:feedback_unhelpful')}
                aria-pressed={chat?.obj === ChatRoleEnum.AI && !!chat.userBadFeedback}
                isDisabled={isFeedbackPending}
                color={
                  chat?.obj === ChatRoleEnum.AI && chat.userBadFeedback
                    ? 'primary.600'
                    : 'myGray.400'
                }
                _hover={{ color: 'primary.600' }}
                onClick={onDislike}
              >
                <MyIcon name="core/chat/feedback/badLight" boxSize="16px" />
              </Button>
            </MyTooltip>
          </Flex>
        )}
      </Flex>
      <Button
        h="32px"
        minH="32px"
        minW={loading ? '90px' : undefined}
        px="14px"
        py={2}
        flexShrink={0}
        borderRadius="6px"
        bg={buttonBackground}
        color="white"
        fontSize="12px"
        fontWeight={500}
        lineHeight="16px"
        letterSpacing="0.5px"
        boxShadow="0 0 1px rgba(19, 51, 107, 0.08), 0 1px 2px rgba(19, 51, 107, 0.05)"
        _hover={{
          bg:
            buttonState === 'loading' || isUnavailable
              ? buttonBackground
              : 'rgba(51, 112, 255, 0.90)'
        }}
        isLoading={buttonState === 'loading'}
        spinner={<Spinner boxSize="16px" thickness="2px" speed="0.65s" />}
        isDisabled={isActionDisabled}
        _disabled={{ opacity: 1, cursor: 'not-allowed' }}
        onClick={() => void apply()}
      >
        {primaryText}
        {buttonState === 'applied' && <MyIcon name="check" boxSize="16px" ml="6px" />}
      </Button>
    </Flex>
  );
};

export default React.memo(RenderWorkflowBuilderVersion);
