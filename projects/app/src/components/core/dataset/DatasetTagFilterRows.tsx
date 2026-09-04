import React, { useEffect, useMemo } from 'react';
import { Box, Button, Flex, HStack, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  createEmptyTagFilterCondition,
  createEmptyTagFilterValue,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  DatasetTagFilterFieldEnum,
  getTagFilterOpsByCondition,
  intersectWorkflowTagOptions,
  isDatasetTagFilterValue,
  isTagFilterOpWithoutValue,
  isTagFilterAttributeField,
  pruneTagFilterConditions,
  type DatasetTagFilterCondition,
  type DatasetTagFilterValue,
  type WorkflowTagFilterOption
} from '@fastgpt/global/core/dataset/workflowTagFilter';
import type { ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getAllTags } from '@/web/core/dataset/api/collection';
import { ReferSelector } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference';
import {
  ArrayTagSelect,
  DateTimeTagInput,
  NumberTagInput,
  tagInputBaseStyles
} from '@/pageComponents/dataset/detail/CollectionCard/TagValueInputs';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { TagFilterFieldSelect, TagFilterOpSelect } from './TagFilterSelects';

export type TagFilterReferenceList = {
  label: string | React.ReactNode;
  value: string;
  children: {
    label: string;
    value: string;
    valueType?: WorkflowIOValueTypeEnum;
  }[];
}[];

/** AND/OR 切换，贴在标题右侧，对齐判断器条件组。 */
export const TagFilterLogicToggle = ({
  value,
  onChange
}: {
  value?: DatasetTagFilterValue;
  onChange: (value: DatasetTagFilterValue) => void;
}) => {
  const logic = value?.logic ?? DatasetTagFilterLogicEnum.AND;

  return (
    <Flex
      px={1}
      color={'primary.600'}
      fontWeight={'medium'}
      alignItems={'center'}
      cursor={'pointer'}
      _hover={{ bg: 'myGray.200' }}
      rounded={'md'}
      onClick={() => {
        onChange({
          ...(value ?? createEmptyTagFilterValue()),
          logic:
            logic === DatasetTagFilterLogicEnum.AND
              ? DatasetTagFilterLogicEnum.OR
              : DatasetTagFilterLogicEnum.AND
        });
      }}
    >
      {logic}
      <MyIcon ml={1} boxSize={5} name="change" />
    </Flex>
  );
};

/** 旧版本升级按钮，贴在标题栏右侧。 */
export const DatasetTagFilterUpgradeButton = ({ onUpgrade }: { onUpgrade: () => void }) => {
  const { t } = useTranslation();
  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    title: t('workflow:tag_filter_upgrade_title'),
    content: t('workflow:tag_filter_upgrade_content')
  });

  return (
    <>
      <Box
        color={'primary.700'}
        fontSize={'sm'}
        fontWeight={'medium'}
        textDecoration={'underline'}
        cursor={'pointer'}
        userSelect={'none'}
        _hover={{ color: 'primary.800' }}
        onClick={() => openConfirm({ onConfirm: onUpgrade })()}
      >
        {t('workflow:tag_filter_upgrade_cta')}
      </Box>
      <ConfirmModal />
    </>
  );
};

/** 旧 JSON 字符串过滤：保留 PromptEditor 编辑，支持变量标签渲染。 */
export const DatasetTagFilterDeprecated = ({
  value,
  onChange,
  variables,
  variableLabels
}: {
  value: string;
  onChange: (value: string) => void;
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
}) => {
  const { t } = useTranslation();

  return (
    <PromptEditor
      value={value}
      onChange={onChange}
      variables={variables}
      variableLabels={variableLabels}
      minH={118}
      title={t('workflow:collection_metadata_filter')}
      placeholder={''}
    />
  );
};

const valueCellEmbeddedStyles = {
  border: 'none',
  boxShadow: 'none',
  h: '36px',
  minH: '36px',
  maxH: '36px',
  borderRadius: 0,
  _hover: { border: 'none' },
  _focus: { border: 'none', boxShadow: 'none' }
};

const TagFilterValueCell = ({
  condition,
  option,
  referenceList,
  onChange
}: {
  condition: DatasetTagFilterCondition;
  option?: WorkflowTagFilterOption;
  referenceList: TagFilterReferenceList;
  onChange: (patch: Partial<DatasetTagFilterCondition>) => void;
}) => {
  const { t } = useTranslation();
  const isCollectionId = condition.field === DatasetTagFilterFieldEnum.collectionId;
  const isReference =
    isCollectionId || condition.valueMode === DatasetTagFilterValueModeEnum.reference;

  const literalInput = (() => {
    if (!condition.tagType) {
      return (
        <Input
          {...tagInputBaseStyles}
          {...valueCellEmbeddedStyles}
          isDisabled
          placeholder={t('workflow:tag_filter_input_value')}
        />
      );
    }
    if (condition.tagType === DatasetCollectionTagTypeEnum.number) {
      return (
        <NumberTagInput
          showStepper
          embedded
          placeholder={t('workflow:tag_filter_input_value')}
          value={typeof condition.value === 'number' ? condition.value : ''}
          onChange={(val) => onChange({ value: val === '' ? undefined : val })}
        />
      );
    }
    if (condition.tagType === DatasetCollectionTagTypeEnum.datetime) {
      return (
        <DateTimeTagInput
          embedded
          value={typeof condition.value === 'number' ? condition.value : ''}
          placeholder={t('workflow:tag_filter_select_time')}
          onChange={(val) => onChange({ value: val })}
        />
      );
    }
    return (
      <ArrayTagSelect
        embedded
        allowCreate={false}
        options={option?.options ?? []}
        placeholder={t('workflow:tag_filter_select_option')}
        value={Array.isArray(condition.value) ? condition.value.map(String) : []}
        onChange={(val) => onChange({ value: val })}
      />
    );
  })();

  return (
    <Flex
      w={'220px'}
      minW={'220px'}
      maxW={'220px'}
      flexShrink={0}
      h={'36px'}
      alignItems={'stretch'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'sm'}
      bg={'white'}
      overflow={'hidden'}
    >
      {isCollectionId ? (
        <Flex
          w={'41px'}
          minW={'41px'}
          maxW={'41px'}
          h={'100%'}
          px={'12px'}
          borderRight={'1px solid'}
          borderColor={'myGray.200'}
          alignItems={'center'}
          justifyContent={'center'}
          flexShrink={0}
        >
          <MyIcon
            name={'core/workflow/inputType/reference'}
            w={'16px'}
            h={'16px'}
            color={'primary.600'}
          />
        </Flex>
      ) : (
        <MyTooltip
          label={
            isReference
              ? t('workflow:click_to_change_reference')
              : t('workflow:click_to_change_value')
          }
        >
          <HStack
            w={'63px'}
            minW={'63px'}
            maxW={'63px'}
            h={'100%'}
            px={'12px'}
            spacing={'6px'}
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
            justifyContent={'center'}
            cursor={'pointer'}
            flexShrink={0}
            _hover={{ bg: 'myGray.50' }}
            onClick={() => {
              if (isReference) {
                onChange({
                  valueMode: DatasetTagFilterValueModeEnum.input,
                  value: undefined
                });
                return;
              }
              onChange({
                valueMode: DatasetTagFilterValueModeEnum.reference,
                value: ['', undefined]
              });
            }}
          >
            <MyIcon
              name={isReference ? 'core/workflow/inputType/reference' : 'core/app/variable/input'}
              w={'16px'}
              h={'16px'}
              color={'primary.600'}
            />
            <MyIcon name={'common/lineChange'} w={'16px'} h={'16px'} color={'myGray.500'} />
          </HStack>
        </MyTooltip>
      )}
      <Box flex={1} minW={0} h={'100%'}>
        {isReference ? (
          <ReferSelector
            placeholder={t('common:select_reference_variable')}
            list={referenceList}
            value={
              Array.isArray(condition.value)
                ? (condition.value as ReferenceItemValueType)
                : undefined
            }
            onSelect={(e) => onChange({ value: e as ReferenceItemValueType })}
            isArray={false}
            ButtonProps={{
              ...valueCellEmbeddedStyles,
              size: 'sm',
              w: '100%',
              px: 3,
              borderWidth: 0
            }}
          />
        ) : (
          literalInput
        )}
      </Box>
    </Flex>
  );
};

const TagFilterConditionRow = ({
  condition,
  options,
  referenceList,
  onChange,
  onRemove
}: {
  condition: DatasetTagFilterCondition;
  options: WorkflowTagFilterOption[];
  referenceList: TagFilterReferenceList;
  onChange: (patch: Partial<DatasetTagFilterCondition>) => void;
  onRemove: () => void;
}) => {
  const option = options.find(
    (item) =>
      !isTagFilterAttributeField(condition.field) &&
      item.tag === condition.tag &&
      item.tagType === condition.tagType
  );
  const ops = getTagFilterOpsByCondition(condition);
  const hideValue = isTagFilterOpWithoutValue(condition.op);

  return (
    <Flex gap={1} alignItems={'center'}>
      <Flex flex={1} minW={0} gap={2} alignItems={'center'} h={'36px'}>
        <TagFilterFieldSelect
          condition={condition}
          options={options}
          onChange={(next) => {
            onChange({
              field: next.field,
              tag: next.tag ?? '',
              tagType: next.tagType,
              op: '',
              valueMode: next.valueMode ?? DatasetTagFilterValueModeEnum.input,
              value: next.value
            });
          }}
        />
        <TagFilterOpSelect
          value={condition.op || undefined}
          list={ops}
          onChange={(op) => onChange({ op, value: undefined })}
        />
        {!hideValue && (
          <TagFilterValueCell
            condition={condition}
            option={option}
            referenceList={referenceList}
            onChange={onChange}
          />
        )}
      </Flex>
      <MyIconButton
        icon={'minus'}
        w={'32px'}
        h={'32px'}
        hoverColor={'red.600'}
        hoverBg={'red.100'}
        onClick={onRemove}
      />
    </Flex>
  );
};

/**
 * 知识库搜索的标签过滤条件行。工作流节点和简易模式共用。
 * 旧 JSON 字符串请走 DatasetTagFilterDeprecated，不要传入本组件。
 */
const DatasetTagFilterRows = ({
  value,
  onChange,
  datasetIds,
  referenceList
}: {
  value: unknown;
  onChange: (value: DatasetTagFilterValue) => void;
  datasetIds: string[];
  referenceList: TagFilterReferenceList;
}) => {
  const { t } = useTranslation();
  const datasetIdsKey = datasetIds.join(',');
  const filterValue = isDatasetTagFilterValue(value) ? value : createEmptyTagFilterValue();

  const {
    data: tagLists = [],
    loading,
    error
  } = useRequest(
    async () => {
      if (datasetIds.length === 0) return [];
      const results = await Promise.all(datasetIds.map(getAllTags));
      return results.map(({ list }) => list);
    },
    {
      manual: false,
      refreshDeps: [datasetIdsKey],
      errorToast: ''
    }
  );

  const options = useMemo(() => intersectWorkflowTagOptions(tagLists), [tagLists]);

  useEffect(() => {
    if (loading || error || datasetIds.length === 0 || !isDatasetTagFilterValue(value)) return;
    const next = pruneTagFilterConditions(value, options);
    if (JSON.stringify(next) === JSON.stringify(value)) return;
    onChange(next);
  }, [datasetIds.length, error, loading, onChange, options, value]);

  return (
    <Box>
      <Flex direction={'column'} gap={2}>
        {filterValue.conditions.map((condition, index) => (
          <TagFilterConditionRow
            key={`${condition.tag ?? ''}-${index}`}
            condition={condition}
            options={options}
            referenceList={referenceList}
            onChange={(patch) => {
              onChange({
                ...filterValue,
                conditions: filterValue.conditions.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, ...patch } : item
                )
              });
            }}
            onRemove={() => {
              if (filterValue.conditions.length <= 1) {
                onChange({
                  ...filterValue,
                  conditions: [createEmptyTagFilterCondition()]
                });
                return;
              }
              onChange({
                ...filterValue,
                conditions: filterValue.conditions.filter((_, itemIndex) => itemIndex !== index)
              });
            }}
          />
        ))}
      </Flex>
      <Button
        mt={2}
        variant={'link'}
        leftIcon={<MyIcon name={'common/addLight'} boxSize={4} mr={-1} />}
        color={'primary.700'}
        onClick={() =>
          onChange({
            ...filterValue,
            conditions: [...filterValue.conditions, createEmptyTagFilterCondition()]
          })
        }
      >
        {t('workflow:tag_filter_add_condition')}
      </Button>
    </Box>
  );
};

export default React.memo(DatasetTagFilterRows);
