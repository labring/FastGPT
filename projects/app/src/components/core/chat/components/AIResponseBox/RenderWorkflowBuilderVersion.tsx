import React, { useMemo, useState } from 'react';
import { Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import {
  ChatItemContext,
  type WorkflowBuilderVersionActions
} from '@/web/core/chat/context/chatItemContext';
import { getWorkflowBuilderVersionDisplayState } from '@fastgpt/global/core/workflow/builder/utils';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';

const RenderWorkflowBuilderVersion = ({
  version,
  responseChatItemId,
  isLastChild
}: {
  version: WorkflowBuilderVersion;
  responseChatItemId: string;
  isLastChild: boolean;
}) => {
  const { t } = useTranslation('workflow');
  const actions = useContextSelector(
    ChatItemContext,
    (value) => value.workflowBuilderVersionActions
  ) as WorkflowBuilderVersionActions | undefined;
  const [displayVersion, setDisplayVersion] = useState(version);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const state = useMemo(
    () =>
      getWorkflowBuilderVersionDisplayState({
        version: displayVersion,
        isLatestReady: !displayVersion.s3Key && isLastChild
      }),
    [displayVersion, isLastChild]
  );

  const run = async (callback: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    setError(undefined);
    try {
      await callback();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workflow_builder_apply_failed'));
    } finally {
      setLoading(false);
    }
  };

  const primaryText = (() => {
    if (state === 'expired') return String(t('workflow_builder_version_expired'));
    if (state === 'available') return String(t('workflow_builder_version_reapply'));
    if (state === 'superseded') return String(t('workflow_builder_version_superseded'));
    return String(t('workflow_builder_version_apply'));
  })();

  return (
    <Flex
      alignItems="center"
      gap={2}
      p={2}
      borderWidth="1px"
      borderColor="myGray.200"
      borderRadius="6px"
      bg="white"
      maxW="100%"
      wrap="wrap"
    >
      <MyIcon name="file/fill/file" w="24px" h="24px" />
      <Flex flex="1" minW="120px" direction="column">
        <Text fontSize="sm" fontWeight={600} noOfLines={1}>
          {displayVersion.name}
        </Text>
        <Text fontSize="xs" color="myGray.500" noOfLines={1}>
          {displayVersion.filename}
        </Text>
        {error && (
          <Text fontSize="xs" color="red.500" noOfLines={2}>
            {error}
          </Text>
        )}
      </Flex>
      <Button
        size="sm"
        leftIcon={
          <MyIcon
            name={state === 'expired' ? 'common/fileNotFound' : 'core/chat/fileDownload'}
            w="16px"
          />
        }
        isLoading={loading}
        isDisabled={!actions || state === 'expired' || state === 'superseded'}
        onClick={() =>
          void run(async () => {
            if (!actions) return;
            setDisplayVersion(await actions.applyVersion(displayVersion, responseChatItemId));
          })
        }
      >
        {primaryText}
      </Button>
    </Flex>
  );
};

export default React.memo(RenderWorkflowBuilderVersion);
