import { useModelChannelTest } from './useModelChannelTest';
import { ChannelStautsMap } from '@/global/aiproxy/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import type { AdminModelChannel } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import {
  Box,
  Button,
  Checkbox,
  Flex,
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
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTag, { type ColorSchemaType } from '@fastgpt/web/components/common/Tag';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useFixedTableHeader } from '@fastgpt/web/hooks/useFixedTableHeader';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useLockFn } from 'ahooks';
import { useMemo, useState } from 'react';

export type ModelChannelModalModel = {
  model: string;
  modelId?: string;
  modelData?: SystemModelDocumentDataType;
  getModelData?: () => SystemModelDocumentDataType | undefined;
  avatar?: string;
};

/**
 * 渲染模型渠道选择内容，不包含 Modal 外壳和提交行为。
 *
 * 由调用方持有选择草稿，因此既可用于独立关联弹窗，也可嵌入模板创建的第二步，
 * 避免步骤切换时卸载并重新创建 Modal 产生动画抖动。
 */
export const ModelChannelSelector = ({
  models,
  channels,
  selectedChannelIds,
  onChange,
  showCurrentModel = true,
  showSelectedModelCount = false,
  showTest = true
}: {
  models: ModelChannelModalModel[];
  channels: AdminModelChannel[];
  selectedChannelIds: number[];
  onChange: (channelIds: number[]) => void;
  showCurrentModel?: boolean;
  showSelectedModelCount?: boolean;
  showTest?: boolean;
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const selectedIds = useMemo(() => new Set(selectedChannelIds), [selectedChannelIds]);
  const { headerContainerRef, bodyContainerRef, headerTableWidth } = useFixedTableHeader();
  const selectedChannelCount = channels.filter((channel) => selectedIds.has(channel.id)).length;
  const isAllSelected = channels.length > 0 && selectedChannelCount === channels.length;
  const testModel = showTest && models.length === 1 ? models[0] : undefined;
  const { testingChannelIds, testModelChannel } = useModelChannelTest({
    target: (() => {
      if (!testModel) return;
      if (testModel.getModelData || testModel.modelData) {
        return {
          source: 'draft' as const,
          getModelData: testModel.getModelData ?? (() => testModel.modelData)
        };
      }
      if (testModel.modelId) {
        return { source: 'installed' as const, modelId: testModel.modelId, model: testModel.model };
      }
    })(),
    channels
  });

  const toggleChannel = (channelId: number) => {
    const next = new Set(selectedIds);
    if (next.has(channelId)) next.delete(channelId);
    else next.add(channelId);
    onChange(channels.filter((channel) => next.has(channel.id)).map((channel) => channel.id));
  };

  return (
    <>
      {showCurrentModel && (
        <Flex alignItems="center" gap={4} mb={3} flexShrink={0} minH="20px">
          <Box fontWeight="500" flexShrink={0}>
            {t('config_model:current_model')}
          </Box>
          {models.length <= 3 ? (
            <Flex alignItems="center" gap={5} minW={0} flexWrap="wrap">
              {models.map((model, index) => (
                <HStack key={`${model.model}:${index}`} spacing={1.5} minW={0}>
                  <Avatar src={model.avatar} w="18px" borderRadius="50%" flexShrink={0} />
                  <Box noOfLines={1}>{model.model}</Box>
                </HStack>
              ))}
            </Flex>
          ) : (
            <Box>{t('config_model:included_models', { count: models.length })}</Box>
          )}
        </Flex>
      )}
      {showSelectedModelCount && (
        <Box mb={3} flexShrink={0} minH="20px" fontWeight="500">
          {t('config_model:selected_model_count', { count: models.length })}
        </Box>
      )}

      <TableContainer
        borderRadius="12px"
        flex="1 1 0"
        minH={0}
        display="flex"
        flexDirection="column"
        gap={2}
        overflow="hidden"
      >
        <TableContainer ref={headerContainerRef} flexShrink={0} overflowX="hidden">
          <Table
            sx={{
              tableLayout: 'fixed',
              width: `${headerTableWidth} !important`
            }}
          >
            <colgroup>
              <col style={{ width: '120px' }} />
              <col />
              <col />
              <col style={{ width: '122px' }} />
              {testModel && <col style={{ width: '80px' }} />}
            </colgroup>
            <Thead>
              <Tr h="40px" bg="myGray.100">
                <Th px={6} border={0}>
                  <HStack spacing={2}>
                    <Checkbox
                      isChecked={isAllSelected}
                      isIndeterminate={selectedChannelCount > 0 && !isAllSelected}
                      onChange={() =>
                        onChange(isAllSelected ? [] : channels.map((channel) => channel.id))
                      }
                    />
                    <Box>{t('common:Select_all')}</Box>
                  </HStack>
                </Th>
                <Th px={6} border={0}>
                  {t('config_model:channel_name')}
                </Th>
                <Th px={6} border={0}>
                  {t('config_model:channel_type')}
                </Th>
                <Th px={6} border={0}>
                  {t('config_model:channel_status')}
                </Th>
                {testModel && (
                  <Th px={6} border={0}>
                    {t('config_model:test')}
                  </Th>
                )}
              </Tr>
            </Thead>
          </Table>
        </TableContainer>
        <TableContainer ref={bodyContainerRef} flex="1 1 0" minH={0} overflowY="auto">
          <Table sx={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '120px' }} />
              <col />
              <col />
              <col style={{ width: '122px' }} />
              {testModel && <col style={{ width: '80px' }} />}
            </colgroup>
            <Tbody color="myGray.600">
              {channels.map((channel) => {
                const status = ChannelStautsMap[channel.status as keyof typeof ChannelStautsMap];
                return (
                  <Tr
                    key={channel.id}
                    h="80px"
                    cursor="pointer"
                    _hover={{ bg: 'myGray.25' }}
                    onClick={() => toggleChannel(channel.id)}
                  >
                    <Td px={6}>
                      <Checkbox
                        isChecked={selectedIds.has(channel.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleChannel(channel.id)}
                      />
                    </Td>
                    <Td px={6} fontWeight="500">
                      <Box noOfLines={1}>{channel.name}</Box>
                    </Td>
                    <Td px={6}>
                      <HStack spacing={2} minW={0}>
                        <Avatar src={channel.protocol.avatar} w="16px" flexShrink={0} />
                        <Box noOfLines={1}>
                          {parseI18nString(channel.protocol.name, i18n.language)}
                        </Box>
                      </HStack>
                    </Td>
                    <Td px={6}>
                      <MyTag
                        type="borderFill"
                        colorSchema={(status?.colorSchema ?? 'gray') as ColorSchemaType}
                      >
                        {status ? t(status.label) : t('config_model:channel_status_unknown')}
                      </MyTag>
                    </Td>
                    {testModel && (
                      <Td px={6}>
                        <Box display="inline-flex">
                          <MyIconButton
                            icon="core/chat/sendLight"
                            tip={t('config_model:model.test_model')}
                            isLoading={testingChannelIds.has(channel.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void testModelChannel(channel.id);
                            }}
                          />
                        </Box>
                      </Td>
                    )}
                  </Tr>
                );
              })}
              {channels.length === 0 && (
                <Tr>
                  <Td colSpan={testModel ? 5 : 4} border={0}>
                    <EmptyTip py={12} text={t('config_model:no_channels')} />
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </TableContainer>
    </>
  );
};

/** 独立的已有渠道关联弹窗；选择内容与模板创建第二步共享。 */
const ModelChannelModal = ({
  models,
  channels,
  selectedChannelIds,
  onConfirm,
  onClose,
  showCurrentModel = true,
  showTest = true
}: {
  models: ModelChannelModalModel[];
  channels: AdminModelChannel[];
  selectedChannelIds: number[];
  onConfirm: (channelIds: number[]) => unknown | Promise<unknown>;
  onClose: () => void;
  showCurrentModel?: boolean;
  showTest?: boolean;
}) => {
  const { t } = useClientTranslation('config_model');
  const [selection, setSelection] = useState(selectedChannelIds);
  const { runAsync: confirmRequest, loading: confirming } = useRequest(async () =>
    onConfirm(selection)
  );
  const confirm = useLockFn(confirmRequest);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('config_model:associate_existing_channels')}
      w="820px"
      h="612px"
      maxW="calc(100vw - 32px)"
      bodyStyles={{ overflow: 'hidden' }}
      footer={
        <>
          <Button size="md" variant="whiteBase" onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button size="md" isLoading={confirming} onClick={confirm}>
            {t('config_model:associate')}
          </Button>
        </>
      }
    >
      <ModelChannelSelector
        models={models}
        channels={channels}
        selectedChannelIds={selection}
        onChange={setSelection}
        showCurrentModel={showCurrentModel}
        showTest={showTest}
      />
    </MyModal>
  );
};

export default ModelChannelModal;
