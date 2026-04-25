import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Input, HStack, IconButton, NumberInput, NumberInputField, Button } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import type { RenderInputProps } from '../type';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getAllTags } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type {
  ReferenceItemValueType,
  SelectedDatasetType
} from '@fastgpt/global/core/workflow/type/io';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useReference, ReferSelector } from './Reference';
import {
  type ConditionRow,
  operatorsByType,
  noValueOps,
  getLogicOp,
  serializeFilter,
  deserializeFilter
} from '@/web/core/dataset/tagFilterUtils';

const TagFilterConfigInput = ({ item, nodeId, inputs }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { referenceList } = useReference({ nodeId });

  const initRows = useMemo(() => deserializeFilter(item.value), [item.value]);

  const [rows, setRows] = useState<ConditionRow[]>(initRows);

  // 获取节点关联的知识库 ID 列表
  const datasetIds = useMemo(() => {
    const datasetsInput = inputs?.find((i) => i.key === NodeInputKeyEnum.datasetSelectList);
    const list = (datasetsInput?.value as SelectedDatasetType[]) || [];
    return list.map((d) => d.datasetId);
  }, [inputs]);

  // 加载所有关联知识库的标签定义（合并去重，按名称去重保留第一个）
  const [allTags, setAllTags] = useState<DatasetTagType[]>([]);
  useRequest(
    async () => {
      if (datasetIds.length === 0) return [];
      const results = await Promise.all(datasetIds.map((id) => getAllTags(id).then((r) => r.list)));
      const nameMap = new Map<string, DatasetTagType>();
      results.flat().forEach((tag) => {
        if (!nameMap.has(tag.tag)) nameMap.set(tag.tag, tag);
      });
      return Array.from(nameMap.values());
    },
    {
      manual: false,
      refreshDeps: [datasetIds.join(',')],
      onSuccess: setAllTags
    }
  );

  // tags 加载后，解析 rows 中 tagId 为空的行
  useEffect(() => {
    if (allTags.length === 0) return;
    const nameToIdMap = new Map(allTags.map((t) => [t.tag, t._id]));
    setRows((prev) => {
      const resolved = prev.map((row) =>
        !row.tagId && row.tagName ? { ...row, tagId: nameToIdMap.get(row.tagName) || '' } : row
      );
      return resolved;
    });
  }, [allTags]);

  // tagId → DatasetTagType
  const tagMap = useMemo(
    () => new Map<string, DatasetTagType>(allTags.map((t) => [t._id, t])),
    [allTags]
  );

  const commit = useCallback(
    (newRows: ConditionRow[]) => {
      const serialized = serializeFilter(newRows, getLogicOp(item.value), tagMap);
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: { ...item, value: serialized }
      });
    },
    [item, nodeId, onChangeNode, tagMap]
  );

  const updateRow = (index: number, updates: Partial<ConditionRow>) => {
    const newRows = rows.map((row, i) => (i === index ? { ...row, ...updates } : row));
    setRows(newRows);
    commit(newRows);
  };

  const addRow = () => {
    if (allTags.length === 0) return;
    const newRows = [
      ...rows,
      {
        tagId: '',
        tagName: '',
        op: '',
        value: '',
        valueIsRef: false,
        valueRef: undefined
      }
    ];
    setRows(newRows);
    commit(newRows);
  };

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    commit(newRows);
  };

  return (
    <Box>
      {rows.map((row, index) => {
        const tagDef = tagMap.get(row.tagId);
        const tagType = tagDef?.tagType || 'string';
        const ops = operatorsByType[tagType] || operatorsByType.string;
        const hideValue = noValueOps.has(row.op);
        const selectedTagIds = new Set(
          rows
            .filter((_, i) => i !== index)
            .map((r) => r.tagId)
            .filter(Boolean)
        );

        return (
          <HStack key={index} mb={2} spacing={1} align={'center'}>
            {/* 标签选择 */}
            <MySelect
              w={'120px'}
              h={'32px'}
              minH={'32px'}
              flexShrink={0}
              value={row.tagId || undefined}
              color={!row.tagId ? 'myGray.500' : undefined}
              placeholder={t('workflow:tag_filter_select_tag')}
              list={allTags.map((tag) => ({
                label: tag.tag,
                value: tag._id,
                isDisabled: selectedTagIds.has(tag._id)
              }))}
              onChange={(val) => {
                const newTagDef = tagMap.get(val);
                const newType = newTagDef?.tagType || 'string';
                const newOps = operatorsByType[newType] || operatorsByType.string;
                const opStillValid = newOps.some((op) => op.value === row.op);
                updateRow(index, {
                  tagId: val,
                  tagName: newTagDef?.tag || '',
                  op: opStillValid ? row.op : '',
                  value: '',
                  valueIsRef: false,
                  valueRef: undefined
                });
              }}
            />

            {/* 操作符 */}
            <MySelect
              w={'110px'}
              h={'32px'}
              minH={'32px'}
              flexShrink={0}
              value={row.op || undefined}
              color={!row.op ? 'myGray.500' : undefined}
              placeholder={t('workflow:tag_filter_select_op')}
              list={ops.map((op) => ({ label: t(op.labelKey), value: op.value }))}
              onChange={(val) => updateRow(index, { op: val })}
            />

            {/* 值输入区域 */}
            {!hideValue && (
              <Flex flex={1} minW={0}>
                <MyTooltip
                  label={
                    row.valueIsRef
                      ? t('workflow:click_to_change_reference')
                      : t('workflow:click_to_change_value')
                  }
                >
                  <HStack
                    w={'4rem'}
                    h={'32px'}
                    border={'1px solid'}
                    borderRight={'none'}
                    borderColor={'myGray.200'}
                    borderLeftRadius={'sm'}
                    justifyContent={'center'}
                    bg={'white'}
                    px={2}
                    spacing={2}
                    cursor={'pointer'}
                    flexShrink={0}
                    _hover={{ bg: 'myGray.50' }}
                    onClick={() =>
                      updateRow(index, {
                        valueIsRef: !row.valueIsRef,
                        value: '',
                        valueRef: undefined
                      })
                    }
                  >
                    {row.valueIsRef ? (
                      <MyIcon
                        name={'core/workflow/inputType/reference'}
                        w={4}
                        color={'primary.600'}
                      />
                    ) : (
                      <MyIcon name={'core/app/variable/input'} w={4} color={'primary.600'} />
                    )}
                    <MyIcon name={'common/lineChange'} w={'14px'} color={'myGray.500'} />
                  </HStack>
                </MyTooltip>
                <Box flex={1} minW={0}>
                  {row.valueIsRef ? (
                    <ReferSelector
                      placeholder={t('common:select_reference_variable')}
                      list={referenceList}
                      value={row.valueRef}
                      onSelect={(val) =>
                        updateRow(index, { valueRef: val as ReferenceItemValueType })
                      }
                      isArray={false}
                      ButtonProps={{
                        h: '32px',
                        minH: '32px',
                        w: '100%',
                        borderRadius: 'sm',
                        borderLeftRadius: 'none',
                        borderColor: 'myGray.200'
                      }}
                    />
                  ) : tagType === 'number' ? (
                    <NumberInput
                      w={'full'}
                      value={row.value}
                      onChange={(v) => updateRow(index, { value: v })}
                      min={undefined}
                    >
                      <NumberInputField
                        h={'32px'}
                        bg={'white'}
                        borderLeftRadius={'none'}
                        placeholder={t('workflow:tag_filter_value_number')}
                      />
                    </NumberInput>
                  ) : tagType === 'datetime' ? (
                    <Input
                      h={'32px'}
                      w={'full'}
                      bg={'white'}
                      borderLeftRadius={'none'}
                      type="datetime-local"
                      value={row.value}
                      onChange={(e) => updateRow(index, { value: e.target.value })}
                    />
                  ) : (
                    <Input
                      h={'32px'}
                      w={'full'}
                      bg={'white'}
                      borderLeftRadius={'none'}
                      value={row.value}
                      onChange={(e) => updateRow(index, { value: e.target.value })}
                      placeholder={t('workflow:tag_filter_input_value')}
                    />
                  )}
                </Box>
              </Flex>
            )}

            {/* 删除 */}
            <IconButton
              aria-label="remove"
              icon={<MyIcon name={'delete'} w={'0.85rem'} />}
              variant={'ghost'}
              size={'xs'}
              color={'myGray.400'}
              _hover={{ color: 'red.500' }}
              onClick={() => removeRow(index)}
            />
          </HStack>
        );
      })}

      {allTags.length > 0 && (
        <Button
          variant={'link'}
          leftIcon={<MyIcon name={'common/addLight'} boxSize={4} mr={-1} />}
          color={'primary.700'}
          onClick={addRow}
          mt={rows.length > 0 ? 2 : 0}
        >
          {t('workflow:tag_filter_add_condition')}
        </Button>
      )}

      {datasetIds.length === 0 && (
        <Box fontSize={'xs'} color={'myGray.400'}>
          {t('workflow:tag_filter_no_dataset')}
        </Box>
      )}

      {datasetIds.length > 0 && allTags.length === 0 && (
        <Box fontSize={'xs'} color={'myGray.400'}>
          {t('workflow:tag_filter_no_tags')}
        </Box>
      )}
    </Box>
  );
};

export default TagFilterConfigInput;

export const TagFilterLogicToggle = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const logic = useMemo(() => getLogicOp(item.value), [item.value]);

  const toggle = useCallback(() => {
    try {
      const parsed = JSON.parse(item.value || '{}');
      const conditions = parsed?.tags?.$and || parsed?.tags?.$or || [];
      const newLogicKey = logic === 'AND' ? '$or' : '$and';
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: { ...item, value: JSON.stringify({ tags: { [newLogicKey]: conditions } }) }
      });
    } catch {}
  }, [item, logic, nodeId, onChangeNode]);

  return (
    <Flex
      ml={1.5}
      px={1}
      color={'primary.600'}
      fontWeight={'medium'}
      alignItems={'center'}
      cursor={'pointer'}
      _hover={{ bg: 'myGray.200' }}
      rounded={'md'}
      onClick={toggle}
    >
      {logic}
      <MyIcon ml={1} boxSize={5} name="change" />
    </Flex>
  );
};
