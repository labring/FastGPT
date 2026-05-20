import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  IconButton,
  Input,
  NumberInput,
  NumberInputField,
  Button,
  Switch,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAllTags } from '@/web/core/dataset/api';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  type ConditionRow,
  operatorsByType,
  noValueOps,
  getLogicOp,
  serializeFilter,
  deserializeFilter
} from '@/web/core/dataset/tagFilterUtils';

type Props = {
  datasets: { datasetId: string; name: string }[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  authTmbId?: boolean;
  onAuthTmbIdChange?: (v: boolean) => void;
};

type FilterMode = 'closed' | 'manual';

const TagFilterSection = ({
  datasets,
  value,
  onChange,
  authTmbId = false,
  onAuthTmbIdChange
}: Props) => {
  const { t } = useTranslation();

  const datasetIds = useMemo(() => datasets.map((d) => d.datasetId), [datasets]);

  const [mode, setMode] = useState<FilterMode>(() => (value ? 'manual' : 'closed'));
  const [rows, setRows] = useState<ConditionRow[]>(() => deserializeFilter(value));
  const [allTags, setAllTags] = useState<DatasetTagType[]>([]);
  const [unAuthDatasetNames, setUnAuthDatasetNames] = useState<string[]>([]);

  // 加载所有关联知识库的标签定义（合并去重，按 tag 名称去重保留第一个）
  // unAuthDataset 错误静默处理，不弹 toast，收集无权限知识库名称后展示提示图标
  useRequest(
    async () => {
      if (mode !== 'manual' || datasetIds.length === 0) return [];
      const results = await Promise.allSettled(
        datasets.map((dataset) => getAllTags(dataset.datasetId).then((r) => r.list))
      );
      const unAuthNames: string[] = [];
      const nameMap = new Map<string, DatasetTagType>();
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          result.value.forEach((tag) => {
            if (!nameMap.has(tag.tag)) nameMap.set(tag.tag, tag);
          });
        } else if (result.reason?.statusText === DatasetErrEnum.unAuthDataset) {
          unAuthNames.push(datasets[i].name);
        }
      });
      setUnAuthDatasetNames(unAuthNames);
      return Array.from(nameMap.values());
    },
    {
      manual: false,
      refreshDeps: [mode, datasetIds.join(',')],
      onSuccess: setAllTags,
      errorToast: ''
    }
  );

  // tags 加载后，解析 rows 中 tagId 为空的行
  useEffect(() => {
    if (allTags.length === 0) return;
    const nameToIdMap = new Map(allTags.map((t) => [t.tag, t._id]));
    setRows((prev) =>
      prev.map((row) =>
        !row.tagId && row.tagName ? { ...row, tagId: nameToIdMap.get(row.tagName) || '' } : row
      )
    );
  }, [allTags]);

  // tagId → DatasetTagType
  const tagMap = useMemo(
    () => new Map<string, DatasetTagType>(allTags.map((t) => [t._id, t])),
    [allTags]
  );

  const logic = useMemo(() => getLogicOp(value), [value]);

  const commit = useCallback(
    (newRows: ConditionRow[]) => {
      const result = serializeFilter(newRows, logic, tagMap);
      onChange(result);
    },
    [logic, onChange, tagMap]
  );

  const toggleLogic = useCallback(() => {
    const newLogic = logic === 'AND' ? 'OR' : 'AND';
    try {
      const parsed = JSON.parse(value || '{}');
      const conditions = parsed?.tags?.$and || parsed?.tags?.$or || [];
      const logicKey = newLogic === 'OR' ? '$or' : '$and';
      onChange(JSON.stringify({ tags: { [logicKey]: conditions } }));
    } catch {}
  }, [value, logic, onChange]);

  const updateRow = (index: number, updates: Partial<ConditionRow>) => {
    const newRows = rows.map((row, i) => (i === index ? { ...row, ...updates } : row));
    setRows(newRows);
    commit(newRows);
  };

  const addRow = () => {
    if (allTags.length === 0) return;
    const newRows = [
      ...rows,
      { tagId: '', tagName: '', op: '', value: '', valueIsRef: false, valueRef: undefined }
    ];
    setRows(newRows);
    commit(newRows);
  };

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    commit(newRows);
  };

  const handleModeChange = (newMode: FilterMode) => {
    setMode(newMode);
    if (newMode === 'closed') {
      setRows([]);
      onChange(undefined);
    }
  };

  return (
    <Accordion allowToggle defaultIndex={[]}>
      <AccordionItem border="none">
        <AccordionButton _hover={{}} px={0}>
          <Flex
            flex="1"
            color={'myWhite.1000'}
            fontSize={'sm'}
            fontWeight="600"
            alignItems={'center'}
          >
            {t('workflow:retrieval_filter')}
          </Flex>
          <AccordionIcon />
        </AccordionButton>
        <AccordionPanel pb={4} px={0}>
          <VStack spacing={3} align="stretch">
            {/* 权限过滤行 */}
            <Flex alignItems={'center'} w={'100%'}>
              <FormLabel
                display={'flex'}
                alignItems={'center'}
                fontSize={'12px'}
                fontWeight={'500'}
                minW={'120px'}
              >
                {t('workflow:permission_filter_label')}
                <QuestionTip ml={1} label={t('workflow:permission_filter_tooltip')} />
              </FormLabel>
              <Switch
                isChecked={authTmbId}
                onChange={(e) => onAuthTmbIdChange?.(e.target.checked)}
              />
            </Flex>
            {/* 标签过滤行 */}
            <Flex alignItems={'center'} w={'100%'}>
              <FormLabel
                display={'flex'}
                alignItems={'center'}
                fontSize={'12px'}
                fontWeight={'500'}
                minW={'120px'}
              >
                {t('workflow:tag_filter_label')}
                <QuestionTip ml={1} label={t('workflow:tag_filter_label_tooltip')} />
              </FormLabel>
              <Flex flex={1} alignItems={'center'} gap={2}>
                <Switch
                  isChecked={mode === 'manual'}
                  onChange={(e) => handleModeChange(e.target.checked ? 'manual' : 'closed')}
                />
                {mode === 'manual' && (
                  <Flex
                    px={1}
                    color={'primary.600'}
                    fontWeight={'medium'}
                    alignItems={'center'}
                    cursor={'pointer'}
                    _hover={{ bg: 'myGray.200' }}
                    rounded={'md'}
                    onClick={toggleLogic}
                  >
                    {logic}
                    <MyIcon ml={1} boxSize={5} name="change" />
                  </Flex>
                )}
                {unAuthDatasetNames.length > 0 && (
                  <MyTooltip
                    label={t('workflow:tag_filter_unauth_datasets', {
                      names: unAuthDatasetNames.map((n) => t('common:enum_quote', { name: n })).join(t('common:comma'))
                    })}
                  >
                    <MyIcon name="common/circleAlert" boxSize={4} color={'orange.400'} />
                  </MyTooltip>
                )}
              </Flex>
            </Flex>

            {/* 条件行列表 */}
            {mode === 'manual' && (
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

                      {/* 值输入区域（无引用模式切换） */}
                      {!hideValue && (
                        <Box flex={1} minW={0}>
                          {tagType === 'number' ? (
                            <NumberInput
                              w={'full'}
                              value={row.value}
                              onChange={(v) => updateRow(index, { value: v })}
                              min={undefined}
                            >
                              <NumberInputField
                                h={'32px'}
                                bg={'white'}
                                placeholder={t('workflow:tag_filter_value_number')}
                              />
                            </NumberInput>
                          ) : tagType === 'datetime' ? (
                            <Input
                              h={'32px'}
                              w={'full'}
                              bg={'white'}
                              type="datetime-local"
                              value={row.value}
                              onChange={(e) => updateRow(index, { value: e.target.value })}
                            />
                          ) : (
                            <Input
                              h={'32px'}
                              w={'full'}
                              bg={'white'}
                              value={row.value}
                              onChange={(e) => updateRow(index, { value: e.target.value })}
                              placeholder={t('workflow:tag_filter_input_value')}
                            />
                          )}
                        </Box>
                      )}

                      {/* 删除 */}
                      <IconButton
                        aria-label="remove"
                        icon={<MyIcon name={'delete'} w={'0.85rem'} />}
                        variant={'ghost'}
                        size={'xs'}
                        color={'myGray.500'}
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
            )}
          </VStack>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default TagFilterSection;
