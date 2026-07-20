import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { getModelChannels } from '@/web/core/ai/channel';
import { ChannelStatusEnum, ChannelStautsMap } from '@/global/aiproxy/constants';

/** aiproxy channel status → { label, colorSchema }; unknown statuses fall back to gray */
const getStatusMap = (status: number) => {
  const key = Object.values(ChannelStatusEnum).includes(status as ChannelStatusEnum)
    ? (status as ChannelStatusEnum)
    : ChannelStatusEnum.ChannelStatusUnknown;
  return ChannelStautsMap[key];
};

/**
 * 渠道数量悬浮查看（设计 §7.3 / F2-S5 场景2）：
 * 模型列表 channelCount 列 hover 时加载该模型桶内关联的渠道（渠道名 + 启用/停用状态），
 * 数据源 GET /core/ai/channel/modelChannels（按 modelId 查渠道，仅 hover 时发起请求）。
 */
const ChannelCountPopover = ({ count, modelId }: { count: number; modelId: string }) => {
  const { t } = useTranslation();
  const { runAsync, data, loading } = useRequest(() => getModelChannels(modelId), {
    manual: true
  });

  return (
    <MyPopover
      trigger="hover"
      placement="bottom-start"
      w={'260px'}
      onOpenFunc={() => runAsync()}
      Trigger={
        <Box
          as={'span'}
          cursor={'pointer'}
          color={'primary.600'}
          textDecoration={'underline'}
          textUnderlineOffset={'3px'}
        >
          {count}
        </Box>
      }
    >
      {() => (
        <Box p={3} fontSize={'sm'}>
          <Box color={'myGray.900'}>{t('account_model:model.channel_count')}</Box>
          <Box mt={1}>
            {loading ? (
              <Box color={'myGray.500'}>...</Box>
            ) : data?.channels?.length ? (
              data.channels.map((ch) => (
                <Flex
                  key={ch.id}
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  py={0.5}
                  gap={2}
                >
                  <Box color={'myGray.600'} minW={0} noOfLines={1} wordBreak={'break-all'}>
                    {ch.name}
                  </Box>
                  <MyTag colorSchema={getStatusMap(ch.status).colorSchema as any} showDot>
                    {getStatusMap(ch.status).label}
                  </MyTag>
                </Flex>
              ))
            ) : (
              <Box color={'myGray.500'}>{t('account_model:model.no_related_channel')}</Box>
            )}
          </Box>
        </Box>
      )}
    </MyPopover>
  );
};

export default ChannelCountPopover;
