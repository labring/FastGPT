import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterFieldEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  createEmptyTagFilterCondition,
  createEmptyTagFilterValue,
  getTagFilterOpsByCondition,
  intersectWorkflowTagOptions,
  isDatasetTagFilterValue,
  isTagFilterAttributeField,
  pruneTagFilterConditions,
  type DatasetTagFilterCondition,
  type DatasetTagFilterValue,
  type WorkflowTagFilterOption
} from '@fastgpt/global/core/dataset/search/tagFilter';
import { isTagFilterOpWithoutValue } from '@fastgpt/global/core/dataset/search/tagFilter/normalizer';
import type {
  ReferenceItemValueType,
  EditorVariablePickerType
} from '@fastgpt/global/core/workflow/type/io';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getAllTags } from '@/web/core/dataset/api/collection';
import { ReferSelector } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference';
import {
  ArrayTagSelect,
  DateTimeTagInput,
  NumberTagInput,
  tagInputBaseStyles
} from '@/pageComponents/dataset/detail/CollectionCard/TagValueInputs';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import type { EditorVariableLabelPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { TagFilterAttrSelect, TagFilterFieldSelect, TagFilterOpSelect } from './TagFilterSelects';

export type TagFilterReferenceList = {
  label: string | React.ReactNode;
  value: string;
  name?: string;
  avatar?: string;
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
      fontSize={'sm'}
      lineHeight={'20px'}
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
      <MyIcon ml={1} w={'14px'} h={'14px'} name="change" />
    </Flex>
  );
};

/** 旧版本升级按钮，贴在标题栏右侧。 */
export const DatasetTagFilterUpgradeButton = ({
  onUpgrade
}: {
  onUpgrade: () => Promise<void>;
}) => {
  const { t } = useTranslation();
  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    title: t('workflow:tag_filter_upgrade_title'),
    content: t('workflow:tag_filter_upgrade_content')
  });
  const { runAsync: runUpgrade, loading } = useRequest(onUpgrade);

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
        onClick={() => openConfirm({ onConfirm: runUpgrade })()}
      >
        {t('workflow:tag_filter_upgrade_cta')}
      </Box>
      <ConfirmModal isLoading={loading} />
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

/** 与判断器 IfElse 一致：左侧自带右边框缺失，右侧控件自带边框与 focus，不做外层统一包边。 */
const valueCellJoinedStyles = {
  h: '36px',
  minH: '36px',
  maxH: '36px',
  borderRadius: 'sm',
  borderLeftRadius: 'none' as const,
  borderColor: 'myGray.200',
  fontSize: 'sm'
};

/**
 * 根据过滤条件行的字段类型和操作符，推导出可接受的工作流引用变量类型。
 * - number 标签：只允许数字类型变量 (number)
 * - datetime 标签 / createTime 属性：允许时间格式字符串 (string) 与毫秒时间戳 (number)
 * - collectionId 属性：允许 ID 列表 (arrayString) 或字符串 (string)
 * - array 标签：
 *   - $in / $notIn / $is / $isNot：集合运算，只允许数组 (arrayString)
 *   - $contains / $notContains：允许单个元素 (string) 或子数组 (arrayString)
 */
export const getTagFilterAllowedValueTypes = (
  condition: DatasetTagFilterCondition
): WorkflowIOValueTypeEnum[] => {
  if (condition.field === DatasetTagFilterFieldEnum.createTime) {
    return [WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.number];
  }
  if (condition.field === DatasetTagFilterFieldEnum.collectionId) {
    return [WorkflowIOValueTypeEnum.arrayString, WorkflowIOValueTypeEnum.string];
  }

  if (condition.tagType === DatasetCollectionTagTypeEnum.datetime) {
    return [WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.number];
  }
  if (condition.tagType === DatasetCollectionTagTypeEnum.number) {
    return [WorkflowIOValueTypeEnum.number];
  }
  if (condition.tagType === DatasetCollectionTagTypeEnum.array) {
    if (condition.op === '$contains' || condition.op === '$notContains') {
      return [WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.arrayString];
    }
    return [WorkflowIOValueTypeEnum.arrayString];
  }

  return [];
};

/**
 * 判断变量输出类型是否与当前条件行允许的目标类型兼容。
 * 兜底类型 any / arrayAny 支持宽松兼容。
 */
export const isTagFilterValueTypeCompatible = (
  itemValueType?: WorkflowIOValueTypeEnum,
  allowedTypes: WorkflowIOValueTypeEnum[] = []
): boolean => {
  if (allowedTypes.length === 0) return true;
  if (!itemValueType || itemValueType === WorkflowIOValueTypeEnum.any) return true;
  return allowedTypes.some((allowed) => {
    if (itemValueType === allowed) return true;
    if (
      allowed === WorkflowIOValueTypeEnum.arrayString &&
      itemValueType === WorkflowIOValueTypeEnum.arrayAny
    ) {
      return true;
    }
    return false;
  });
};

/**
 * 判断条件行是否已选中具体属性或标签，未选定时禁用取值模式切换。
 */
export const isTagFilterAttrSelected = (condition: DatasetTagFilterCondition): boolean =>
  Boolean(condition.tagType && (condition.field || condition.tag));

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
  const isAttrSelected = isTagFilterAttrSelected(condition);
  const isOpDisabled = isTagFilterOpWithoutValue(condition.op);
  const canSwitchMode = isAttrSelected && !isOpDisabled;

  const filteredReferenceList = useMemo(() => {
    const allowedTypes = getTagFilterAllowedValueTypes(condition);
    if (allowedTypes.length === 0) return referenceList;

    return referenceList
      .map((group) => ({
        ...group,
        children: group.children.filter((child) =>
          isTagFilterValueTypeCompatible(child.valueType, allowedTypes)
        )
      }))
      .filter((group) => group.children.length > 0);
  }, [condition, referenceList]);

  const literalInput = (() => {
    if (!condition.tagType) {
      return (
        <Input
          {...tagInputBaseStyles}
          {...valueCellJoinedStyles}
          placeholder={t('workflow:tag_filter_input_value')}
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );
    }
    if (condition.tagType === DatasetCollectionTagTypeEnum.number) {
      return (
        <NumberTagInput
          showStepper
          joined
          placeholder={t('workflow:tag_filter_input_value')}
          value={typeof condition.value === 'number' ? condition.value : ''}
          onChange={(val) => onChange({ value: val === '' ? undefined : val })}
        />
      );
    }
    if (condition.tagType === DatasetCollectionTagTypeEnum.datetime) {
      return (
        <DateTimeTagInput
          joined
          value={typeof condition.value === 'number' ? condition.value : ''}
          placeholder={t('workflow:tag_filter_select_time')}
          onChange={(val) => onChange({ value: val })}
        />
      );
    }
    return (
      <ArrayTagSelect
        joined
        allowCreate={false}
        options={option?.options ?? []}
        placeholder={t('workflow:tag_filter_select_option')}
        value={Array.isArray(condition.value) ? condition.value.map(String) : []}
        onChange={(val) => onChange({ value: val })}
      />
    );
  })();

  return (
    <Flex position={'relative'} flex={1} minW={0} h={'36px'} alignItems={'stretch'}>
      {isCollectionId ? (
        <Flex
          w={'41px'}
          minW={'41px'}
          maxW={'41px'}
          h={'36px'}
          px={'12px'}
          border={'1px solid'}
          borderRight={'none'}
          borderColor={'myGray.200'}
          borderLeftRadius={'sm'}
          bg={'white'}
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
          isDisabled={!canSwitchMode}
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
            h={'36px'}
            px={'12px'}
            spacing={'6px'}
            border={'1px solid'}
            borderRight={'none'}
            borderColor={'myGray.200'}
            borderLeftRadius={'sm'}
            bg={'white'}
            justifyContent={'center'}
            cursor={canSwitchMode ? 'pointer' : 'not-allowed'}
            flexShrink={0}
            _hover={canSwitchMode ? { bg: 'myGray.50' } : undefined}
            onClick={() => {
              if (!canSwitchMode) return;
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
              color={canSwitchMode ? 'primary.600' : 'myGray.400'}
            />
            <MyIcon
              name={'common/lineChange'}
              w={'16px'}
              h={'16px'}
              color={canSwitchMode ? 'myGray.500' : 'myGray.400'}
            />
          </HStack>
        </MyTooltip>
      )}
      <Box flex={1} minW={0} h={'36px'}>
        {isReference ? (
          <ReferSelector
            placeholder={t('common:select_reference_variable')}
            list={filteredReferenceList}
            value={
              Array.isArray(condition.value)
                ? (condition.value as ReferenceItemValueType)
                : undefined
            }
            onSelect={(e) => onChange({ value: e as ReferenceItemValueType })}
            isArray={false}
            ButtonProps={{
              ...valueCellJoinedStyles,
              size: 'sm',
              w: '100%',
              px: 3
            }}
          />
        ) : (
          literalInput
        )}
      </Box>

      {isOpDisabled && (
        <Box
          position={'absolute'}
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg={'whiteAlpha.700'}
          zIndex={1}
          borderRadius={'sm'}
          cursor={'not-allowed'}
        />
      )}
    </Flex>
  );
};

const TagFilterConditionRow = ({
  condition,
  options,
  referenceList,
  isSystem = false,
  onChange,
  onRemove
}: {
  condition: DatasetTagFilterCondition;
  options: WorkflowTagFilterOption[];
  referenceList: TagFilterReferenceList;
  isSystem?: boolean;
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

  const handleFieldChange = (next: DatasetTagFilterCondition) => {
    onChange({
      field: next.field,
      tag: next.tag ?? '',
      tagType: next.tagType,
      op: '',
      valueMode: next.valueMode ?? DatasetTagFilterValueModeEnum.input,
      value: next.value
    });
  };

  return (
    <Flex gap={1} alignItems={'center'} w={'100%'}>
      <Flex flex={1} minW={0} gap={2} alignItems={'center'} h={'36px'}>
        {isSystem ? (
          <TagFilterAttrSelect condition={condition} onChange={handleFieldChange} />
        ) : (
          <TagFilterFieldSelect
            condition={condition}
            options={options}
            onChange={handleFieldChange}
          />
        )}
        <TagFilterOpSelect
          value={condition.op || undefined}
          list={ops}
          onChange={(op) => onChange({ op, value: undefined })}
        />
        <TagFilterValueCell
          condition={condition}
          option={option}
          referenceList={referenceList}
          onChange={onChange}
        />
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
 * 拉取所选知识库的标签交集，并在知识库变更后自动清理已失效的自定义标签过滤条件。
 * 供标签过滤组件（需展示下拉选项）与应用表单外层（弹窗关闭时增删知识库同步清理）共用。
 */
export const useDatasetTagFilterPrune = ({
  datasetIds,
  value,
  onChange,
  fetchWhenEmptyValue = false
}: {
  datasetIds: string[];
  value: unknown;
  onChange: (value: DatasetTagFilterValue) => void;
  fetchWhenEmptyValue?: boolean;
}) => {
  const { feConfigs } = useSystemStore();
  const datasetIdsKey = datasetIds.join(',');
  const hasCustomTagCondition =
    isDatasetTagFilterValue(value) &&
    value.conditions.some((item) => !isTagFilterAttributeField(item.field) && Boolean(item.tag));
  const shouldFetch =
    Boolean(feConfigs?.isPlus) &&
    datasetIds.length > 0 &&
    (fetchWhenEmptyValue || hasCustomTagCondition);

  const { data, loading, error } = useRequest(
    async () => {
      if (!shouldFetch) return undefined;
      const results = await Promise.all(datasetIds.map(getAllTags));
      return {
        key: datasetIdsKey,
        tagLists: results.map(({ list }) => list)
      };
    },
    {
      manual: false,
      refreshDeps: [datasetIdsKey, shouldFetch],
      errorToast: ''
    }
  );

  const options = useMemo(
    () => (datasetIds.length === 0 ? [] : intersectWorkflowTagOptions(data?.tagLists ?? [])),
    [data?.tagLists, datasetIds.length]
  );

  useEffect(() => {
    if (
      loading ||
      error ||
      !shouldFetch ||
      data?.key !== datasetIdsKey ||
      !isDatasetTagFilterValue(value)
    ) {
      return;
    }

    const next = pruneTagFilterConditions(value, options);
    if (JSON.stringify(next) === JSON.stringify(value)) return;
    onChange(next);
  }, [data?.key, datasetIdsKey, error, loading, onChange, options, shouldFetch, value]);

  return { options };
};

/**
 * 知识库搜索的标签过滤条件行。工作流节点和简易模式共用。
 * 界面按「自定义标签（支持 AND / OR）」与「系统标签（与自定义标签固定 AND 交集）」分组展示。
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
  const filterValue = isDatasetTagFilterValue(value) ? value : createEmptyTagFilterValue();

  // 系统标签尚未选择具体属性时的待选空行
  const [pendingSystemRows, setPendingSystemRows] = useState<DatasetTagFilterCondition[]>([]);

  const customConditions = filterValue.conditions.filter(
    (item) => !isTagFilterAttributeField(item.field)
  );
  const systemConditions = filterValue.conditions.filter((item) =>
    isTagFilterAttributeField(item.field)
  );

  // 每组无条件时默认至少展示 1 条空行
  const customRows =
    customConditions.length > 0 ? customConditions : [createEmptyTagFilterCondition()];
  const pendingRows =
    systemConditions.length === 0 && pendingSystemRows.length === 0
      ? [createEmptyTagFilterCondition()]
      : pendingSystemRows;

  const { options } = useDatasetTagFilterPrune({
    datasetIds,
    value,
    onChange,
    fetchWhenEmptyValue: true
  });

  const updateGroup = (isSystem: boolean, conditions: DatasetTagFilterCondition[]) => {
    onChange({
      ...filterValue,
      conditions: isSystem
        ? [...customRows, ...conditions]
        : [
            ...(conditions.length > 0 ? conditions : [createEmptyTagFilterCondition()]),
            ...systemConditions
          ]
    });
  };

  /** 两组共用增删改与行渲染；待选系统行只存在于界面，选定属性后才写入过滤配置。 */
  const renderConditions = (isSystem: boolean) => {
    const committed = isSystem ? systemConditions : customRows;
    const rows = isSystem ? [...systemConditions, ...pendingRows] : customRows;

    return (
      <>
        <Flex direction={'column'} gap={2} w={'100%'}>
          {rows.map((condition, index) => {
            const isPending = isSystem && index >= systemConditions.length;
            const pendingIndex = index - systemConditions.length;

            return (
              <TagFilterConditionRow
                key={`${isSystem ? 'system' : 'custom'}-${index}-${condition.field ?? condition.tag ?? ''}`}
                condition={condition}
                options={options}
                referenceList={referenceList}
                isSystem={isSystem}
                onChange={(patch) => {
                  const nextCondition = { ...condition, ...patch };
                  if (isPending) {
                    if (isTagFilterAttributeField(patch.field)) {
                      setPendingSystemRows(pendingRows.filter((_, idx) => idx !== pendingIndex));
                      updateGroup(true, [...systemConditions, nextCondition]);
                    } else {
                      setPendingSystemRows(
                        pendingRows.map((item, idx) =>
                          idx === pendingIndex ? nextCondition : item
                        )
                      );
                    }
                    return;
                  }
                  updateGroup(
                    isSystem,
                    committed.map((item, idx) => (idx === index ? nextCondition : item))
                  );
                }}
                onRemove={() => {
                  if (isPending) {
                    setPendingSystemRows(pendingRows.filter((_, idx) => idx !== pendingIndex));
                    return;
                  }
                  updateGroup(
                    isSystem,
                    committed.filter((_, idx) => idx !== index)
                  );
                }}
              />
            );
          })}
        </Flex>
        <Button
          variant={'link'}
          h={'34px'}
          minH={'34px'}
          leftIcon={<MyIcon name={'common/addLight'} boxSize={4} mr={-1} />}
          color={'primary.700'}
          onClick={() => {
            const condition = createEmptyTagFilterCondition();
            if (isSystem) {
              setPendingSystemRows([...pendingRows, condition]);
              return;
            }
            updateGroup(false, [...customRows, condition]);
          }}
        >
          {t('workflow:tag_filter_add_condition')}
        </Button>
      </>
    );
  };

  return (
    <Box
      position={'relative'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'md'}
      px={'16px'}
      pt={'24px'}
      pb={'8px'}
      bg={'white'}
    >
      {/* 外层固定 AND 标识：自定义标签与系统标签始终求交集 */}
      <Flex
        position={'absolute'}
        left={'12px'}
        top={'-11px'}
        bg={'white'}
        px={'4px'}
        borderRadius={'sm'}
        alignItems={'center'}
        justifyContent={'center'}
      >
        <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.500'} lineHeight={'20px'}>
          {DatasetTagFilterLogicEnum.AND}
        </Box>
      </Flex>

      <Flex direction={'column'} gap={4} w={'100%'} minW={0}>
        {/* 1. 自定义标签区块 */}
        <Box
          position={'relative'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          px={'16px'}
          pt={'16px'}
          pb={'8px'}
          w={'100%'}
        >
          <Box position={'absolute'} left={'12px'} top={'-11px'} bg={'white'} borderRadius={'md'}>
            <TagFilterLogicToggle value={filterValue} onChange={onChange} />
          </Box>

          <Flex direction={'column'} gap={2} w={'100%'} minW={0} alignItems={'flex-start'}>
            <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'} lineHeight={'20px'}>
              {t('workflow:tag_filter_custom_tags')}
            </Box>
            {renderConditions(false)}
          </Flex>
        </Box>

        {/* 2. 系统标签区块 */}
        <Flex direction={'column'} gap={2} w={'100%'} minW={0} alignItems={'flex-start'}>
          <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'} lineHeight={'20px'}>
            {t('workflow:tag_filter_system_tags')}
          </Box>
          {renderConditions(true)}
        </Flex>
      </Flex>
    </Box>
  );
};

export default React.memo(DatasetTagFilterRows);
