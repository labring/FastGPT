import { ChannelStautsMap } from '@/global/aiproxy/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { AdminModelChannel } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import {
  Box,
  Button,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTag, { type ColorSchemaType } from '@fastgpt/web/components/common/Tag';
import { useFixedTableHeader } from '@fastgpt/web/hooks/useFixedTableHeader';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';

const ChannelTableColumns = () => (
  <colgroup>
    <col style={{ width: '160px' }} />
    <col />
    <col style={{ width: '100px' }} />
    <col style={{ width: '100px' }} />
  </colgroup>
);

/** 新增与编辑模型共用的渠道入口和已关联渠道概览；关联变更在模型保存时统一提交。 */
const ModelLinkedChannels = ({
  channels,
  selectedIds,
  onCreate,
  onAssociate,
  onManage,
  onTest,
  testingChannelIds,
  onRemove
}: {
  channels: AdminModelChannel[];
  selectedIds: Set<number>;
  onCreate?: () => void;
  onAssociate: () => void;
  onManage: () => void;
  onTest: (channelId: number) => void;
  testingChannelIds: ReadonlySet<number>;
  onRemove: (channelId: number) => void;
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const linkedChannels = channels.filter((channel) => selectedIds.has(channel.id));
  const { headerContainerRef, bodyContainerRef, headerTableWidth } = useFixedTableHeader();

  return (
    <Box>
      <HStack spacing={2} mb={3} flexWrap="wrap">
        {onCreate && (
          <Button
            size="sm"
            variant="primaryOutline"
            leftIcon={<MyIcon name="common/addLight" w="16px" />}
            onClick={onCreate}
          >
            {t('config_model:create_channel')}
          </Button>
        )}
        <Button
          size="sm"
          variant="primaryOutline"
          leftIcon={<MyIcon name="common/link" w="16px" />}
          onClick={onAssociate}
        >
          {t('config_model:associate_existing_channels')}
        </Button>
        <Button
          size="sm"
          variant="primaryOutline"
          leftIcon={<MyIcon name="common/upperRight" w="16px" />}
          onClick={onManage}
        >
          {t('config_model:channel_management')}
        </Button>
      </HStack>

      <TableContainer
        maxH="220px"
        border="1px solid"
        borderColor="myGray.200"
        borderRadius="12px"
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        <TableContainer
          ref={headerContainerRef}
          flexShrink={0}
          overflowX="hidden"
          bg="myGray.100"
          borderTopRadius="12px"
        >
          <Table size="sm" sx={{ tableLayout: 'fixed', width: `${headerTableWidth} !important` }}>
            <ChannelTableColumns />
            <Thead>
              <Tr h="40px">
                <Th px={3} border={0}>
                  {t('config_model:channel_name')}
                </Th>
                <Th px={3} border={0}>
                  {t('config_model:channel_type')}
                </Th>
                <Th px={3} border={0}>
                  {t('config_model:channel_status')}
                </Th>
                <Th px={3} border={0}>
                  {t('common:Operation')}
                </Th>
              </Tr>
            </Thead>
          </Table>
        </TableContainer>

        <TableContainer ref={bodyContainerRef} flex="1 1 auto" minH={0} overflowY="auto">
          <Table size="sm" sx={{ tableLayout: 'fixed' }}>
            <ChannelTableColumns />
            <Tbody color="myGray.600">
              {linkedChannels.map((channel) => {
                const status = ChannelStautsMap[channel.status as keyof typeof ChannelStautsMap];

                return (
                  <Tr key={channel.id} h="56px">
                    <Td px={3} fontWeight="500">
                      <Box noOfLines={1}>{channel.name}</Box>
                    </Td>
                    <Td px={3}>
                      <HStack spacing={2} minW={0}>
                        <Avatar src={channel.protocol.avatar} w="16px" flexShrink={0} />
                        <Box noOfLines={1}>
                          {parseI18nString(channel.protocol.name, i18n.language)}
                        </Box>
                      </HStack>
                    </Td>
                    <Td px={3}>
                      <MyTag
                        type="borderFill"
                        colorSchema={(status?.colorSchema ?? 'gray') as ColorSchemaType}
                      >
                        {status ? t(status.label) : t('config_model:channel_status_unknown')}
                      </MyTag>
                    </Td>
                    <Td px={3}>
                      <HStack spacing={1}>
                        <MyIconButton
                          icon="core/chat/sendLight"
                          tip={t('config_model:model.test_model')}
                          isLoading={testingChannelIds.has(channel.id)}
                          onClick={() => onTest(channel.id)}
                        />
                        <MyIconButton
                          icon="delete"
                          tip={t('config_model:remove_channel_association')}
                          hoverColor="red.500"
                          onClick={() => onRemove(channel.id)}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
              {linkedChannels.length === 0 && (
                <Tr>
                  <Td colSpan={4} border={0}>
                    <EmptyTip mt={0} py={5} text={t('config_model:model_channel_empty')} />
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </TableContainer>
    </Box>
  );
};

export default ModelLinkedChannels;
