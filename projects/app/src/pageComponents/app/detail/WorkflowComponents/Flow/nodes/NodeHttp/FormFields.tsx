import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Table, Thead, Tbody, Tr, Th, Td, IconButton } from '@chakra-ui/react';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import type { EditorVariableLabelPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { HttpFormFieldType as PropsArrType } from '@fastgpt/global/core/workflow/http/type';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

const HTTP_PARAM_NAME_COLUMN_WIDTH = '170px';
const HTTP_OPERATION_COLUMN_WIDTH = '46px';

/** 编辑 HTTP 表格字段；只有 multipart Body 提供文件类型，文本模式保留原配置。 */
export const HttpFormFields = ({
  nodeId,
  input,
  variables,
  externalProviderWorkflowVariables,
  allowFiles = false
}: {
  allowFiles?: boolean;
  nodeId: string;
  input: FlowNodeInputItemType;
  variables: EditorVariableLabelPickerType[];
  externalProviderWorkflowVariables: {
    key: string;
    label: string;
  }[];
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const draftValuesRef = React.useRef<Record<number, PropsArrType>>({});

  const list = useMemo(() => (input.value || []) as PropsArrType[], [input.value]);
  const latestListRef = useRef(list);
  const inputRef = useRef(input);
  const pendingListRef = useRef<PropsArrType[] | undefined>();
  const pendingFrameRef = useRef<number | undefined>(undefined);
  const [rowKeys, setRowKeys] = useState<string[]>(() =>
    Array.from({ length: list.length + 1 }, (_, index) => `http-param-${index}`)
  );

  useEffect(() => {
    draftValuesRef.current = {};
    latestListRef.current = list;
    inputRef.current = input;
  }, [input, list]);

  useEffect(
    () => () => {
      if (pendingFrameRef.current !== undefined) {
        cancelAnimationFrame(pendingFrameRef.current);
      }
      pendingFrameRef.current = undefined;
      pendingListRef.current = undefined;
    },
    []
  );

  const updateListAndNode = useCallback(
    (nextList: PropsArrType[]) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: inputRef.current.key,
        value: {
          ...inputRef.current,
          value: nextList
        }
      });
    },
    [nodeId, onChangeNode]
  );

  const scheduleListUpdate = useCallback(
    (update: (currentList: PropsArrType[]) => PropsArrType[]) => {
      // 让浏览器先完成下一个输入框的 focus，再回写 ReactFlow 节点，避免失焦更新打断点击。
      pendingListRef.current = update(pendingListRef.current ?? latestListRef.current);
      if (pendingFrameRef.current !== undefined) return;

      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = undefined;
        const nextList = pendingListRef.current;
        pendingListRef.current = undefined;
        if (nextList) updateListAndNode(nextList);
      });
    },
    [updateListAndNode]
  );

  const handleRowBlur = useCallback(
    (index: number, field: 'key' | 'value' | 'type', value: string) => {
      const currentItem = list[index] ?? { key: '', type: 'string', value: '' };
      const nextItem = {
        ...currentItem,
        ...draftValuesRef.current[index],
        [field]: value
      } as PropsArrType;
      draftValuesRef.current[index] = nextItem;

      if (
        index < list.length &&
        currentItem.key === nextItem.key &&
        currentItem.value === nextItem.value &&
        currentItem.type === nextItem.type
      ) {
        return;
      }

      if (
        nextItem.key &&
        list.some((item, itemIndex) => itemIndex !== index && item.key === nextItem.key)
      ) {
        toast({
          status: 'warning',
          title: t('common:core.module.http.Key already exists')
        });
        return;
      }

      if (index === list.length) {
        if (!nextItem.key) return;
        setRowKeys((currentKeys) => {
          const nextKeys = [...currentKeys];
          while (nextKeys.length < list.length + 1) {
            nextKeys.push(`http-param-${nextKeys.length}`);
          }
          let nextKeyIndex = nextKeys.length;
          while (nextKeys.includes(`http-param-${nextKeyIndex}`)) {
            nextKeyIndex += 1;
          }
          nextKeys.push(`http-param-${nextKeyIndex}`);
          return nextKeys;
        });
        scheduleListUpdate((currentList) => {
          const nextList = [...currentList];
          if (index === nextList.length) {
            nextList.push(nextItem);
          } else {
            nextList[index] = nextItem;
          }
          return nextList;
        });
        return;
      }

      scheduleListUpdate((currentList) =>
        currentList.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
      );
    },
    [list, scheduleListUpdate, t, toast]
  );

  const handleDelete = useCallback(
    (index: number) => {
      draftValuesRef.current = {};
      setRowKeys((currentKeys) => {
        const nextKeys = [...currentKeys];
        while (nextKeys.length < list.length + 1) {
          nextKeys.push(`http-param-${nextKeys.length}`);
        }
        return nextKeys.filter((_, itemIndex) => itemIndex !== index);
      });
      scheduleListUpdate((currentList) =>
        currentList.filter((_, itemIndex) => itemIndex !== index)
      );
    },
    [list, scheduleListUpdate, setRowKeys]
  );

  const Render = useMemo(() => {
    return (
      <Box
        className={'nodrag nowheel'}
        borderRadius={'md'}
        overflow={'hidden'}
        borderWidth={'1px'}
        borderBottom={'none'}
        bg={'white'}
      >
        <FixedTableContainer flush className="nodrag nowheel">
          <Table
            w={'full'}
            style={{ tableLayout: 'fixed' }}
            sx={{ 'thead, thead tr, thead th': { borderRadius: '0 !important' } }}
          >
            <colgroup>
              <col style={{ width: HTTP_PARAM_NAME_COLUMN_WIDTH }} />
              {allowFiles && <col style={{ width: '90px' }} />}
              <col />
              <col style={{ width: HTTP_OPERATION_COLUMN_WIDTH }} />
            </colgroup>
            <Thead>
              <Tr>
                <Th
                  px={2}
                  w={HTTP_PARAM_NAME_COLUMN_WIDTH}
                  borderRight={'1px solid'}
                  borderColor={'myGray.200'}
                >
                  {t('common:core.module.http.Props name')}
                </Th>
                {allowFiles && <Th px={2}>{t('workflow:http_field_type')}</Th>}
                <Th px={2} borderRight={'1px solid'} borderColor={'myGray.200'}>
                  {t('common:core.module.http.Props value')}
                </Th>
                <Th px={0} w={HTTP_OPERATION_COLUMN_WIDTH} textAlign={'center'}></Th>
              </Tr>
            </Thead>
            <Tbody>
              {[...list, { key: '', value: '', type: 'string' }].map((item, index) => (
                <Tr key={`${input.key}-${rowKeys[index] ?? `http-param-${index}`}`}>
                  <Td
                    p={0}
                    w={HTTP_PARAM_NAME_COLUMN_WIDTH}
                    borderRight={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    <HttpInput
                      placeholder={t('common:textarea_variable_picker_tip')}
                      value={item.key}
                      variableLabels={variables}
                      variables={externalProviderWorkflowVariables}
                      tabIndex={0}
                      resetOnValueChange={false}
                      onBlur={(val) => handleRowBlur(index, 'key', val)}
                    />
                  </Td>
                  {allowFiles && (
                    <Td p={1}>
                      <MySelect
                        aria-label={t('workflow:http_field_type')}
                        value={item.type === 'file' ? 'file' : 'string'}
                        list={[
                          { label: t('workflow:http_field_text'), value: 'string' },
                          { label: t('common:File'), value: 'file' }
                        ]}
                        isDisabled={!item.key}
                        onChange={(value) => handleRowBlur(index, 'type', value)}
                      />
                    </Td>
                  )}
                  <Td p={0} borderRight={'1px solid'} borderColor={'myGray.200'}>
                    <HttpInput
                      placeholder={
                        allowFiles && item.type === 'file'
                          ? t('workflow:http_file_field_placeholder')
                          : t('common:textarea_variable_picker_tip')
                      }
                      value={item.value}
                      variables={externalProviderWorkflowVariables}
                      variableLabels={variables}
                      tabIndex={0}
                      resetOnValueChange={false}
                      onBlur={(val) => handleRowBlur(index, 'value', val)}
                    />
                  </Td>
                  <Td
                    p={0}
                    px={'3px'}
                    w={HTTP_OPERATION_COLUMN_WIDTH}
                    whiteSpace={'nowrap'}
                    verticalAlign={'middle'}
                  >
                    <Flex h={'24px'} alignItems={'center'} justifyContent={'center'}>
                      {index !== list.length && (
                        <IconButton
                          icon={<MyIcon name={'delete'} w={'14px'} />}
                          size={'xs'}
                          variant={'unstyled'}
                          color={'myGray.600'}
                          w={'24px'}
                          h={'24px'}
                          minW={'24px'}
                          p={'5px'}
                          aria-label={t('common:Delete')}
                          tabIndex={0}
                          _hover={{ color: 'red.600' }}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleDelete(index)}
                        />
                      )}
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </FixedTableContainer>
      </Box>
    );
  }, [
    allowFiles,
    externalProviderWorkflowVariables,
    handleDelete,
    handleRowBlur,
    input.key,
    list,
    rowKeys,
    t,
    variables
  ]);

  return Render;
};
