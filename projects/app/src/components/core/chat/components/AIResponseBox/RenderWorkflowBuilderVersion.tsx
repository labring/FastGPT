import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Flex, Spinner, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import {
  ChatItemContext,
  type WorkflowBuilderVersionActions
} from '@/web/core/chat/context/chatItemContext';
import { getWorkflowBuilderVersionDisplayState } from '@fastgpt/global/core/workflow/builder/utils';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import {
  getWorkflowBuilderVersionButtonState,
  workflowBuilderAppliedFeedbackDuration
} from './utils';

const RenderWorkflowBuilderVersion = ({
  version,
  responseChatItemId
}: {
  version: WorkflowBuilderVersion;
  responseChatItemId: string;
}) => {
  const { t } = useTranslation('workflow');
  const actions = useContextSelector(
    ChatItemContext,
    (value) => value.workflowBuilderVersionActions
  ) as WorkflowBuilderVersionActions | undefined;
  const [displayVersion, setDisplayVersion] = useState(version);
  const [loading, setLoading] = useState(false);
  const [showApplied, setShowApplied] = useState(false);
  const [runtimeExpired, setRuntimeExpired] = useState(false);
  const appliedResetTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const state = useMemo(
    () =>
      runtimeExpired
        ? 'expired'
        : getWorkflowBuilderVersionDisplayState({ version: displayVersion }),
    [displayVersion, runtimeExpired]
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
    if (loading) return;
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
      if (displayVersion.expiresAt && new Date(displayVersion.expiresAt).getTime() <= Date.now()) {
        markExpired();
        return;
      }

      try {
        setDisplayVersion(await actions.applyVersion(displayVersion, responseChatItemId));
        markApplied();
      } catch (error) {
        if (error instanceof Error && /expired/i.test(error.message)) {
          markExpired(false);
        }
        throw error;
      }
    });

  const isUnavailable = buttonState === 'expired';
  const buttonBackground =
    buttonState === 'loading' || isUnavailable ? 'rgba(51, 112, 255, 0.30)' : '#3370FF';
  const isActionDisabled = !actions || isUnavailable || buttonState === 'applied';

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
      <MyIcon name="core/app/workflowVersion" boxSize="24px" flexShrink={0} />
      <Text
        flex={1}
        minW={0}
        color="#485264"
        fontSize="16px"
        lineHeight="24px"
        letterSpacing="0.5px"
        noOfLines={1}
      >
        <Text as="span" color="#2B5FD9">
          {displayVersion.name}
        </Text>
        {t('workflow_builder_version_ready_suffix')}
      </Text>
      <Button
        h="32px"
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
            buttonState === 'loading' || isUnavailable || buttonState === 'applied'
              ? buttonBackground
              : 'rgba(51, 112, 255, 0.90)'
        }}
        isLoading={buttonState === 'loading'}
        spinner={<Spinner boxSize="16px" thickness="2px" speed="0.65s" />}
        isDisabled={isActionDisabled}
        _disabled={{ opacity: 1, cursor: buttonState === 'applied' ? 'default' : 'not-allowed' }}
        onClick={() => void apply()}
      >
        {primaryText}
        {buttonState === 'applied' && <MyIcon name="check" boxSize="16px" ml="6px" />}
      </Button>
    </Flex>
  );
};

export default React.memo(RenderWorkflowBuilderVersion);
