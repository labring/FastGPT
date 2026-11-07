import React, { useState } from 'react';
import { Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import type { ChatAgentBuilderVersion } from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentBuilderVersion';

/** 历史消息只展示手动应用入口，读取记录本身不会覆盖当前编辑中的配置。 */
const RenderChatAgentBuilderVersion = ({
  version,
  responseChatItemId,
  isChatting
}: {
  version: ChatAgentBuilderVersion;
  responseChatItemId: string;
  isChatting: boolean;
}) => {
  const { t } = useTranslation('app');
  const actions = useContextSelector(
    ChatItemContext,
    (value) => value.chatAgentBuilderVersionActions
  );
  const [expired, setExpired] = useState(() => new Date(version.expiresAt).getTime() <= Date.now());
  return (
    <Flex alignItems="center" gap={3} p={3} borderWidth="1px" borderRadius="md">
      <Avatar src="core/app/type/agentFill" w="24px" flexShrink={0} />
      <Text flex={1} minW={0} noOfLines={1} fontSize="sm">
        {t('chat_agent_config_ready')}
      </Text>
      <Button
        size="sm"
        flexShrink={0}
        isLoading={actions?.isApplying}
        isDisabled={!actions || expired || isChatting}
        onClick={() => {
          // 页面长时间停留后再次点击，也需按当前时间检查过期状态。
          if (new Date(version.expiresAt).getTime() <= Date.now()) {
            setExpired(true);
            return;
          }
          actions?.applyConfig(responseChatItemId);
        }}
      >
        {expired ? t('chat_agent_config_expired') : t('chat_agent_config_apply')}
      </Button>
    </Flex>
  );
};

export default React.memo(RenderChatAgentBuilderVersion);
