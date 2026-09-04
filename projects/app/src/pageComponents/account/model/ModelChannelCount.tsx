import { ChannelStautsMap } from '@/global/aiproxy/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { AdminModelChannel } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { Box, HStack, VStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTag from '@fastgpt/web/components/common/Tag';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';

/** 展示模型关联的渠道数量，并在悬浮时列出具体渠道。 */
const ModelChannelCount = ({
  channels,
  onClick
}: {
  channels: AdminModelChannel[];
  onClick?: () => void;
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const label =
    channels.length > 0
      ? t('config_model:channel_count', { count: channels.length })
      : t('config_model:no_channel_configured');
  const trigger = (
    <Box
      data-row-action
      display="inline-flex"
      alignItems="center"
      gap={2}
      p={1}
      borderRadius="md"
      whiteSpace="nowrap"
      cursor={onClick ? 'pointer' : 'default'}
      _hover={{ bg: 'myGray.50', color: 'primary.700' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onClick();
      }}
    >
      <MyIcon name="common/link" w="14px" />
      <Box>{label}</Box>
    </Box>
  );

  if (channels.length === 0) return trigger;

  return (
    <MyPopover
      trigger="hover"
      closeOnTriggerLeave
      placement="bottom"
      hasArrow
      Trigger={trigger}
      w="360px"
      maxW="calc(100vw - 32px)"
      p={5}
      borderRadius="lg"
      boxShadow="lg"
    >
      {() => (
        <VStack alignItems="stretch" spacing={3} maxH="280px" overflowY="auto">
          {channels.map((channel) => {
            const status = ChannelStautsMap[channel.status as keyof typeof ChannelStautsMap];
            return (
              <HStack key={channel.id} spacing={3}>
                <Box w="110px" flexShrink={0} noOfLines={1}>
                  {channel.name}
                </Box>
                <HStack flex={1} minW={0}>
                  <Avatar src={channel.protocol.avatar} w="18px" />
                  <Box noOfLines={1}>{parseI18nString(channel.protocol.name, i18n.language)}</Box>
                </HStack>
                <MyTag type="borderFill" flexShrink={0} colorSchema={status?.colorSchema as any}>
                  {status ? t(status.label as any) : t('config_model:channel_status_unknown')}
                </MyTag>
              </HStack>
            );
          })}
        </VStack>
      )}
    </MyPopover>
  );
};

export default ModelChannelCount;
