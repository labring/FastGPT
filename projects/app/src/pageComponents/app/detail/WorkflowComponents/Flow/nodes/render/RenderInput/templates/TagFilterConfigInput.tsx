import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Select, Input, HStack, IconButton } from '@chakra-ui/react';
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
import { datetimeLocalToUtcTs, utcTsToDatetimeLocal } from '@fastgpt/global/common/string/time';

type ConditionRow = {
  tagId: string;
  tagName: string;
  op: string;
  value: string;
  valueIsRef: boolean;
  valueRef?: ReferenceItemValueType;
};

// 操作符选项按 tagType 分组，label 使用 i18n key
const operatorsByType: Record<string, { value: string; labelKey: string }[]> = {
  string: [
    { value: '$eq', labelKey: 'workflow:tag_filter_op_string_eq' },
    { value: '$ne', labelKey: 'workflow:tag_filter_op_string_ne' },
    { value: '$contains', labelKey: 'workflow:tag_filter_op_contains' },
    { value: '$notContains', labelKey: 'workflow:tag_filter_op_not_contains' },
    { value: '$startsWith', labelKey: 'workflow:tag_filter_op_starts_with' },
    { value: '$endsWith', labelKey: 'workflow:tag_filter_op_ends_with' },
    { value: '$regex', labelKey: 'workflow:tag_filter_op_regex' },
    { value: '$empty', labelKey: 'workflow:tag_filter_op_empty' },
    { value: '$notEmpty', labelKey: 'workflow:tag_filter_op_not_empty' }
  ],
  number: [
    { value: '$eq', labelKey: 'workflow:tag_filter_op_number_eq' },
    { value: '$ne', labelKey: 'workflow:tag_filter_op_number_ne' },
    { value: '$gt', labelKey: 'workflow:tag_filter_op_gt' },
    { value: '$lt', labelKey: 'workflow:tag_filter_op_lt' },
    { value: '$gte', labelKey: 'workflow:tag_filter_op_gte' },
    { value: '$lte', labelKey: 'workflow:tag_filter_op_lte' },
    { value: '$empty', labelKey: 'workflow:tag_filter_op_empty' },
    { value: '$notEmpty', labelKey: 'workflow:tag_filter_op_not_empty' }
  ],
  datetime: [
    { value: '$eq', labelKey: 'workflow:tag_filter_op_string_eq' },
    { value: '$ne', labelKey: 'workflow:tag_filter_op_string_ne' },
    { value: '$gt', labelKey: 'workflow:tag_filter_op_datetime_after' },
    { value: '$lt', labelKey: 'workflow:tag_filter_op_datetime_before' },
    { value: '$empty', labelKey: 'workflow:tag_filter_op_empty' },
    { value: '$notEmpty', labelKey: 'workflow:tag_filter_op_not_empty' }
  ]
};

const noValueOps = new Set(['$empty', '$notEmpty']);

// 从 JSON 字符串中获取逻辑操作符
const getLogicOp = (value?: string): 'AND' | 'OR' => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed?.tags?.$or ? 'OR' : 'AND';
  } catch {
    return 'AND';
  }
};

// 将 GUI 状态序列化为 JSON 字符串
// 变量引用以 ['$ref', nodeId, outputId] 格式存储，便于后端运行时解析
// datetime 类型的值转为 UTC 毫秒时间戳（number），与存储侧格式保持一致
const serializeFilter = (
  rows: ConditionRow[],
  logic: 'AND' | 'OR' = 'AND',
  tagMap?: Map<string, DatasetTagType>
): string | undefined => {
  if (rows.length === 0) return undefined;
  const conditions = rows
    .filter((r) => r.tagName)
    .map((r) => {
      let val: any;
      if (noValueOps.has(r.op)) {
        val = null;
      } else if (r.valueIsRef && r.valueRef) {
        val = ['$ref', r.valueRef[0], r.valueRef[1]];
      } else {
        const tagType = tagMap?.get(r.tagId)?.tagType;
        if (tagType === 'datetime' && r.value) {
          val = datetimeLocalToUtcTs(r.value);
        } else {
          val = r.value;
        }
      }
      return { [r.tagName]: { [r.op]: val } };
    });
  if (conditions.length === 0) return undefined;
  const logicKey = logic === 'OR' ? '$or' : '$and';
  return JSON.stringify({ tags: { [logicKey]: conditions } });
};

// 从 JSON 字符串反序列化 GUI 状态
const deserializeFilter = (value?: string): ConditionRow[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const arr = parsed?.tags?.$and || parsed?.tags?.$or;
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object') {
      return arr.map((cond: Record<string, Record<string, any>>) => {
        const tagName = Object.keys(cond)[0];
        const opObj = cond[tagName];
        const op = Object.keys(opObj)[0];
        const val = opObj[op];

        // 检测变量引用格式 ['$ref', nodeId, outputId]
        if (Array.isArray(val) && val.length === 3 && val[0] === '$ref') {
          return {
            tagId: '',
            tagName,
            op,
            value: '',
            valueIsRef: true,
            valueRef: [val[1], val[2]] as ReferenceItemValueType
          };
        }
        return {
          tagId: '',
          tagName,
          op,
          value:
            val == null ? '' : typeof val === 'number' ? utcTsToDatetimeLocal(val) : String(val),
          valueIsRef: false,
          valueRef: undefined
        };
      });
    }
  } catch {}
  return [];
};

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
    const firstTag = allTags[0];
    const tagType = firstTag.tagType || 'string';
    const defaultOp = operatorsByType[tagType]?.[0]?.value || '$eq';
    const newRows = [
      ...rows,
      {
        tagId: firstTag._id,
        tagName: firstTag.tag,
        op: defaultOp,
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
    <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'md'} p={3} bg={'myGray.25'}>
      {rows.map((row, index) => {
        const tagDef = tagMap.get(row.tagId);
        const tagType = tagDef?.tagType || 'string';
        const ops = operatorsByType[tagType] || operatorsByType.string;
        const hideValue = noValueOps.has(row.op);

        return (
          <HStack key={index} mb={2} spacing={1} align={'center'}>
            {/* 标签选择 */}
            <Select
              size={'sm'}
              w={'100px'}
              flexShrink={0}
              value={row.tagId}
              onChange={(e) => {
                const newTagDef = tagMap.get(e.target.value);
                const newType = newTagDef?.tagType || 'string';
                const newOp = operatorsByType[newType]?.[0]?.value || '$eq';
                updateRow(index, {
                  tagId: e.target.value,
                  tagName: newTagDef?.tag || '',
                  op: newOp,
                  value: '',
                  valueIsRef: false,
                  valueRef: undefined
                });
              }}
            >
              {allTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.tag}
                </option>
              ))}
            </Select>

            {/* 操作符 */}
            <Select
              size={'sm'}
              w={'80px'}
              flexShrink={0}
              value={row.op}
              onChange={(e) => updateRow(index, { op: e.target.value })}
            >
              {ops.map((op) => (
                <option key={op.value} value={op.value}>
                  {t(op.labelKey)}
                </option>
              ))}
            </Select>

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
                    h={10}
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
                        h: '40px',
                        minH: '40px',
                        w: '100%',
                        borderRadius: 'sm',
                        borderLeftRadius: 'none',
                        borderColor: 'myGray.200'
                      }}
                    />
                  ) : tagType === 'datetime' ? (
                    <Input
                      h={'40px'}
                      w={'full'}
                      type="datetime-local"
                      borderLeftRadius={'none'}
                      value={row.value}
                      onChange={(e) => updateRow(index, { value: e.target.value })}
                    />
                  ) : (
                    <Input
                      h={'40px'}
                      w={'full'}
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
        <Flex
          align={'center'}
          color={'primary.600'}
          cursor={'pointer'}
          fontSize={'sm'}
          onClick={addRow}
          mt={rows.length > 0 ? 1 : 0}
        >
          <MyIcon name={'common/addLight'} w={'0.85rem'} mr={1} />
          {t('workflow:tag_filter_add_condition')}
        </Flex>
      )}

      {allTags.length === 0 && (
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
