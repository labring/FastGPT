import React from 'react';
import { Box, Flex, NumberInput, NumberInputField, Stack, Switch } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  ChatHistoryWindowSchema,
  type ChatHistoryWindowType
} from '@fastgpt/global/core/workflow/template/system/aiChat/type';

/** 周期窗口仅用于普通对话的数字历史输入；配置和现有固定轮数分别保存。 */
const ChatHistoryWindow = ({
  nodeId,
  inputs,
  fixedInput,
  history
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  fixedInput: React.ReactNode;
  history: number;
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (value) => value.onChangeNode);
  const input = inputs.find((item) => item.key === NodeInputKeyEnum.aiChatHistoryWindow);
  const enabled = input?.value !== undefined && input?.value !== null;
  const parsed = ChatHistoryWindowSchema.safeParse(input?.value);
  const min = Math.min(50, Math.max(0, Math.floor(history || 0)));
  const config = parsed.success ? parsed.data : { min, max: Math.min(50, Math.max(min, min * 2)) };

  const update = (value?: ChatHistoryWindowType) => {
    const nextInput: FlowNodeInputItemType = {
      key: NodeInputKeyEnum.aiChatHistoryWindow,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.object,
      ...input,
      value
    };
    onChangeNode(
      input
        ? { nodeId, type: 'updateInput', key: nextInput.key, value: nextInput }
        : { nodeId, type: 'addInput', value: nextInput }
    );
  };

  return (
    <Stack spacing={3} className={'nodrag nowheel'}>
      <Flex justifyContent={'space-between'} alignItems={'center'}>
        <Box fontSize={'sm'}>{t('workflow:history_window_enabled')}</Box>
        <Switch
          aria-label={t('workflow:history_window_enabled')}
          isChecked={enabled}
          onChange={(event) => update(event.target.checked ? config : undefined)}
        />
      </Flex>
      {enabled ? (
        <>
          <Flex gap={3}>
            {(['min', 'max'] as const).map((key) => (
              <Box key={key} flex={1}>
                <Box fontSize={'mini'} color={'myGray.600'} mb={1}>
                  {key === 'min'
                    ? t('workflow:history_window_min')
                    : t('workflow:history_window_max')}
                </Box>
                <NumberInput
                  key={config[key]}
                  min={0}
                  max={50}
                  precision={0}
                  defaultValue={config[key]}
                >
                  <NumberInputField
                    aria-label={
                      key === 'min'
                        ? t('workflow:history_window_min')
                        : t('workflow:history_window_max')
                    }
                    onBlur={(event) => {
                      // 完成整次数值编辑后再提交，避免输入 20 的第一位 2 提前改变另一侧边界。
                      const raw = event.currentTarget.value.trim();
                      const number = Number(raw);
                      if (!raw || !Number.isFinite(number)) {
                        event.currentTarget.value = String(config[key]);
                        return;
                      }
                      const value = Math.min(50, Math.max(0, Math.floor(number)));
                      update(
                        key === 'min'
                          ? { min: value, max: Math.max(value, config.max) }
                          : { min: Math.min(value, config.min), max: value }
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </NumberInput>
              </Box>
            ))}
          </Flex>
          <Box fontSize={'mini'} color={'myGray.500'}>
            {t('workflow:history_window_tip')}
          </Box>
        </>
      ) : (
        fixedInput
      )}
    </Stack>
  );
};

export default React.memo(ChatHistoryWindow);
