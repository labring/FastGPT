import {
  DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES,
  getHandleId
} from '@fastgpt/global/common/workflow/reference';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import type {
  WorkflowFieldSnapshot,
  WorkflowReferenceOption,
  WorkflowReferenceStatus
} from '@fastgpt/global/core/workflow/editor/types';
import {
  getWorkflowReferenceItems,
  isConfiguredReferenceValue
} from '@fastgpt/global/core/workflow/editor/utils';
import type { TFunction } from 'next-i18next';
import dynamic from 'next/dynamic';
import {
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { useWorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useReferenceOptions } from '@/web/core/workflow/editor/react/useWorkflowQueries';
import { useWorkflowEditorAdapter } from '@/web/core/workflow/editor/react/workflowEditorProvider';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';
import { Position } from '@xyflow/react';
import { MySourceHandle } from '../../Handle';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';

const MultipleRowSelect = dynamic(() =>
  import('@fastgpt/web/components/common/MySelect/MultipleRowSelect').then(
    (v) => v.MultipleRowSelect
  )
);
const MultipleRowArraySelect = dynamic(() =>
  import('@fastgpt/web/components/common/MySelect/MultipleRowSelect').then(
    (v) => v.MultipleRowArraySelect
  )
);
const Avatar = dynamic(() => import('@fastgpt/web/components/common/Avatar'));

export type ReferenceListItem = {
  label: string | React.ReactNode;
  value: string;
  name?: string;
  avatar?: string;
  children: {
    label: string;
    value: string;
    valueType?: WorkflowIOValueTypeEnum;
  }[];
};

type CommonSelectProps = {
  placeholder?: string;
  list: ReferenceListItem[];
  popDirection?: 'top' | 'bottom';
  ButtonProps?: ButtonProps;
  excludeValueTypes?: WorkflowIOValueTypeEnum[];
  /** 懒加载列表：打开选择器时计算一次；已选内容的展示来自当前字段 scope。 */
  onOpenList?: () => void;
};
type SelectProps<T extends boolean> = CommonSelectProps & {
  isArray?: T;
  value?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType;
  onSelect: (val?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType) => void;
};

const referenceOptionsToList = ({
  options,
  t,
  excludeValueTypes
}: {
  options: readonly WorkflowReferenceOption[];
  t: TFunction;
  excludeValueTypes?: WorkflowIOValueTypeEnum[];
}): ReferenceListItem[] => {
  const bySource = new Map<string, ReferenceListItem>();

  options.forEach((option) => {
    if (option.sourceType && excludeValueTypes?.includes(option.sourceType)) return;
    const [sourceId, outputId] = option.reference;
    const source: ReferenceListItem = bySource.get(sourceId) ?? {
      label: (
        <Flex alignItems={'center'}>
          <Avatar src={option.icon} w={'1.05rem'} borderRadius={'xs'} />
          <Box ml={1}>{option.sourceLabel ? t(option.sourceLabel as any) : sourceId}</Box>
        </Flex>
      ),
      value: sourceId,
      name: option.sourceLabel ? t(option.sourceLabel as any) : sourceId,
      avatar: option.icon,
      children: []
    };
    source.children.push({
      label: option.outputLabel ? t(option.outputLabel as any) : outputId,
      value: outputId,
      valueType: option.sourceType
    });
    bySource.set(sourceId, source);
  });

  return [...bySource.values()];
};

/**
 * 常驻的可用引用列表：只在本节点或其上游来源闭包变化时重算，无关字段提交不带动。
 * 已选内容按 list 解析展示，因此列表必须常驻；只在打开时计算的场景用 useLazyReferenceList。
 */
export const useReference = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  includeChildren,
  excludeValueTypes
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  includeChildren?: boolean;
  excludeValueTypes?: WorkflowIOValueTypeEnum[];
}) => {
  const { t } = useSafeTranslation();
  const options = useReferenceOptions({ nodeId, valueType, includeChildren });

  const referenceList = useMemo(
    () => referenceOptionsToList({ options, t, excludeValueTypes }),
    [excludeValueTypes, options, t]
  );

  return { referenceList };
};

/**
 * 懒加载的可用引用列表：打开选择器时从最新文档快照计算一次，不建订阅、不进 Context。
 * 已选内容的展示由字段引用状态（useField().reference）提供，因此关闭期间列表可以保持为空。
 */
export const useLazyReferenceList = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  includeChildren
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  includeChildren?: boolean;
}) => {
  const { t } = useSafeTranslation();
  const adapter = useWorkflowEditorAdapter();
  const query = useMemo(
    () => ({ nodeId, valueType, ...(includeChildren ? { includeChildren: true } : {}) }),
    [includeChildren, nodeId, valueType]
  );
  const [referenceList, setReferenceList] = useState<ReferenceListItem[]>([]);

  const loadReferenceList = useCallback(() => {
    setReferenceList(referenceOptionsToList({ options: adapter.getReferenceOptions(query), t }));
  }, [adapter, query, t]);

  return { referenceList, loadReferenceList };
};

/**
 * 引用选择输入模板：写入只提交字段值（updateField），来源与已选内容都从字段句柄读，
 * 因此编辑只刷新当前字段订阅，不触发全图重算。
 */
const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useSafeTranslation();
  const fieldData = useField(nodeId, item.key, 'input', (field) => field?.data);
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });
  const flowNodeType = useNode(nodeId, (node) => node?.data.flowNodeType);
  const currentInput = fieldData?.input;
  const isDynamicOptionsInput =
    flowNodeType === FlowNodeTypeEnum.userSelect && item.key === NodeInputKeyEnum.userSelectOptions;
  const excludeValueTypes = isDynamicOptionsInput ? DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES : undefined;
  const referenceList = useMemo(
    () =>
      referenceOptionsToList({
        options: fieldData?.referenceOptions ?? [],
        t,
        excludeValueTypes
      }),
    [excludeValueTypes, fieldData?.referenceOptions, t]
  );
  const isArray = isDynamicOptionsInput || (currentInput?.valueType?.includes('array') ?? false);

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      fieldActions.setValue(e);
    },
    [fieldActions]
  );
  // 嵌套容器节点（loop/parallelRun/loopRun）里的下拉向上展开，避免被子节点覆盖。
  const popDirection = useMemo(
    () => (flowNodeType && isNestedParentNodeType(flowNodeType) ? 'top' : 'bottom'),
    [flowNodeType]
  );

  if (!currentInput) return null;

  return (
    <WorkflowFieldScope nodeId={nodeId} fieldKey={currentInput.key}>
    <Box position={'relative'}>
      <ReferSelector
        placeholder={
          t(currentInput.referencePlaceholder as any) ||
          (isDynamicOptionsInput
            ? t('workflow:please_select_variable')
            : t('common:select_reference_variable'))
        }
        list={referenceList}
        value={currentInput.value}
        onSelect={onSelect}
        popDirection={popDirection}
        isArray={isArray}
        excludeValueTypes={excludeValueTypes}
      />
      {isDynamicOptionsInput && (
        <MySourceHandle
          nodeId={nodeId}
          handleId={getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY)}
          position={Position.Right}
          translate={[34, 0]}
        />
      )}
    </Box>
    </WorkflowFieldScope>
  );
};

export default React.memo(Reference);

const getReferenceStatus = (
  references: WorkflowFieldSnapshot['references'] | undefined,
  value: unknown,
  excludeValueTypes?: WorkflowIOValueTypeEnum[]
) => {
  const reference = getWorkflowReferenceItems(value)[0];
  if (!reference) return undefined;
  return references?.find((status) => {
    if (status.sourceType && excludeValueTypes?.includes(status.sourceType)) return false;
    const statusReference = getWorkflowReferenceItems(status.reference)[0];
    return statusReference?.[0] === reference[0] && statusReference?.[1] === reference[1];
  });
};

const getInvalidReason = (
  status: { readonly code: WorkflowReferenceStatus['code'] } | undefined,
  t: TFunction
) => {
  switch (status?.code) {
    case 'invalid_reference':
      return t('common:core.workflow.check.reference_deleted');
    case 'unreachable_reference':
      return t('common:core.workflow.check.reference_unreachable');
    case 'invalid_reference_type':
      return t('common:core.workflow.check.reference_type_mismatch');
    default:
      return t('common:invalid_variable');
  }
};

const getReferenceTitle = (value: ReferenceItemValueType | undefined) =>
  value?.filter(Boolean).join('.') || undefined;

const SingleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection,
  ButtonProps,
  onOpenList,
  excludeValueTypes
}: SelectProps<false>) => {
  // runtime 只发 i18n key 或字面量，展示名统一在渲染层过一遍 t。
  const { t } = useSafeTranslation();
  const references = useWorkflowReferenceScope();
  const getSelectValue = useCallback(
    (value: ReferenceValueType) => {
      if (!value) return undefined;

      // 给出字段引用状态时按状态展示：来源被删除时状态里带的是 Reference Snapshot 的
      // 历史名字与图标，因此失效引用同样可读，只有连历史元数据都没有的才回落占位符。
      const status = getReferenceStatus(references, value, excludeValueTypes);
      if (status) {
        const nodeText = status?.sourceLabel ? t(status.sourceLabel) : '';
        const outputText = status?.outputLabel ? t(status.outputLabel) : '';
        if (!nodeText && !outputText) return undefined;
        return {
          avatar: status?.icon,
          text: nodeText && outputText ? `${nodeText} > ${outputText}` : nodeText || outputText
        };
      }

      const firstColumn = list.find((item) => item.value === value[0]);
      if (!firstColumn) {
        return undefined;
      }
      const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
      if (!secondColumn) {
        return undefined;
      }
      const nodeText = firstColumn.name || '';
      const outputText = secondColumn.label || '';
      return {
        avatar: firstColumn.avatar,
        text: nodeText && outputText ? `${nodeText} > ${outputText}` : nodeText || outputText
      };
    },
    [excludeValueTypes, list, references, t]
  );

  // 存量数据可能是多选形态 [[nodeId, outputId]]：展示时取第一项即可，不回写文档。
  // 挂载时回写会让同一节点的多行动态输入用同一份渲染基线互相覆盖，
  // 打开工作流就触发提交风暴（见 editor/utils 的 getWorkflowReferenceItems）。
  const selectorVal = useMemo(
    () => getWorkflowReferenceItems(value)[0] as ReferenceItemValueType,
    [value]
  );
  const status = getReferenceStatus(references, selectorVal, excludeValueTypes);
  const isInvalidReference =
    isConfiguredReferenceValue(selectorVal) &&
    (status
      ? status.code !== 'valid' || !getSelectValue(selectorVal)
      : !getSelectValue(selectorVal));
  const invalidReason = getInvalidReason(status, t);
  const referenceTitle = getReferenceTitle(selectorVal);

  const ItemSelector = useMemo(() => {
    const selected = getSelectValue(selectorVal);

    return (
      <MultipleRowSelect
        label={
          selected || isInvalidReference ? (
            <Flex
              alignItems={'center'}
              minW={0}
              w={'100%'}
              overflow={'hidden'}
              fontSize={'sm'}
              fontWeight={'normal'}
              data-preserve-width
            >
              {!!selected?.avatar && (
                <Avatar src={selected.avatar} w={'1.05rem'} borderRadius={'xs'} flexShrink={0} />
              )}
              <Box
                data-preserve-width
                ml={selected?.avatar ? 1 : 0}
                minW={0}
                flex={1}
                overflow={'hidden'}
                textOverflow={'ellipsis'}
                whiteSpace={'nowrap'}
                color={isInvalidReference ? 'red.600' : undefined}
                title={isInvalidReference ? referenceTitle : undefined}
              >
                {selected?.text || t('common:invalid_variable')}
              </Box>
              {isInvalidReference && (
                <MyTooltip label={invalidReason} shouldWrapChildren={false}>
                  <Box
                    display={'flex'}
                    alignItems={'center'}
                    ml={1}
                    color={'red.500'}
                    cursor={'help'}
                    pointerEvents={'auto'}
                    aria-label={invalidReason}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MyIcon name="common/warn" boxSize={3.5} />
                  </Box>
                </MyTooltip>
              )}
            </Flex>
          ) : (
            <Box fontSize={'sm'} fontWeight={'normal'} color={'myGray.500'}>
              {placeholder}
            </Box>
          )
        }
        value={selectorVal}
        list={list}
        onSelect={onSelect as any}
        popDirection={popDirection}
        ButtonProps={
          isInvalidReference
            ? {
                ...ButtonProps,
                borderColor: 'red.500',
                _hover: { borderColor: 'red.400' }
              }
            : ButtonProps
        }
        onOpenFunc={onOpenList}
      />
    );
  }, [
    ButtonProps,
    getSelectValue,
    list,
    onOpenList,
    onSelect,
    placeholder,
    popDirection,
    selectorVal,
    isInvalidReference,
    invalidReason,
    referenceTitle,
    t
  ]);

  return ItemSelector;
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection,
  ButtonProps,
  onOpenList,
  excludeValueTypes
}: SelectProps<true>) => {
  const { t } = useSafeTranslation();
  const references = useWorkflowReferenceScope();
  const getSelectValue = useCallback(
    (value: ReferenceValueType) => {
      if (!value) return [];

      const firstColumn = list.find((item) => item.value === value[0]);
      if (!firstColumn) {
        return [];
      }
      const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
      if (!secondColumn) {
        return [];
      }
      return [firstColumn.label, secondColumn.label];
    },
    [list]
  );

  // 存量数据可能是单选形态 [nodeId, outputId]：展示时升级成引用数组，不回写文档。
  const arrayVal = useMemo(() => getWorkflowReferenceItems(value), [value]);

  // Keep invalid items visible so users can inspect and remove stale references.
  const formatList = useMemo(() => {
    // 给出字段引用状态时按状态解析展示名，此时 list 可以是懒加载的空数组。
    // 失效引用不再被抹成空名：来源被删除时状态里带的是 Reference Snapshot 的历史名字与图标。
    return arrayVal.map((item) => {
      const status = getReferenceStatus(references, item, excludeValueTypes);
      if (status) {
        return {
          rawValue: item,
          nodeName: status.sourceLabel ? t(status.sourceLabel) : '',
          outputName: status.outputLabel ? t(status.outputLabel) : '',
          icon: status.icon,
          status
        };
      }
      const [nodeName, outputName] = getSelectValue(item);
      return {
        rawValue: item,
        nodeName,
        outputName,
        icon: undefined,
        status: undefined
      };
    });
  }, [arrayVal, excludeValueTypes, getSelectValue, references, t]);

  useEffect(() => {
    // Adapt array type from old version
    if (Array.isArray(value) && typeof value[0] === 'string') {
      // @ts-ignore
      onSelect([value]);
    }
  }, [formatList, onSelect, value]);

  const ArraySelector = useMemo(() => {
    return (
      <MultipleRowArraySelect
        label={
          formatList.length > 0 ? (
            <Grid
              py={3}
              gridTemplateColumns={'1fr 1fr'}
              gap={2}
              fontSize={'sm'}
              fontWeight={'normal'}
              pointerEvents={'auto'}
              _hover={{
                '.delete': {
                  visibility: 'visible'
                }
              }}
            >
              {formatList.map(({ nodeName, outputName, icon, rawValue, status }, index) => {
                const isValidReference = status
                  ? status.code === 'valid' && Boolean(nodeName && outputName)
                  : Boolean(nodeName && outputName);
                const isInvalidReference = !isValidReference;
                const invalidReason = getInvalidReason(status, t);
                const referenceTitle = getReferenceTitle(rawValue);
                const row = (
                  <Flex
                    key={index}
                    w={'100%'}
                    alignItems={'center'}
                    pointerEvents={'auto'}
                    bg={isInvalidReference ? 'red.50' : 'primary.50'}
                    color={'myGray.900'}
                    py={1}
                    px={1.5}
                    rounded={'sm'}
                  >
                    <Flex
                      alignItems={'center'}
                      flex={'1 0 0'}
                      className="textEllipsis"
                      color={isInvalidReference ? 'red.600' : undefined}
                      title={isInvalidReference ? referenceTitle : undefined}
                    >
                      {isInvalidReference ? (
                        <>
                          {!!icon && <Avatar src={icon} w={'1rem'} mr={1} borderRadius={'xs'} />}
                          {nodeName || outputName ? (
                            <>
                              {nodeName}
                              {!!nodeName && !!outputName && (
                                <MyIcon
                                  name={'common/rightArrowLight'}
                                  mx={1}
                                  w={'12px'}
                                  color={'myGray.500'}
                                />
                              )}
                              {outputName}
                            </>
                          ) : (
                            t('common:invalid_variable')
                          )}
                        </>
                      ) : (
                        <>
                          {!!icon && <Avatar src={icon} w={'1rem'} mr={1} borderRadius={'xs'} />}
                          {nodeName}
                          <MyIcon
                            name={'common/rightArrowLight'}
                            mx={1}
                            w={'12px'}
                            color={'myGray.500'}
                          />
                          {outputName}
                        </>
                      )}
                    </Flex>
                    <MyIcon
                      className="delete"
                      visibility={'hidden'}
                      name={'common/closeLight'}
                      w={'1rem'}
                      ml={1}
                      cursor={'pointer'}
                      color={'myGray.500'}
                      _hover={{
                        color: 'red.600'
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // formatList 与 arrayVal 保持同序，直接按下标删除原始值。
                        onSelect(arrayVal.filter((_, itemIndex) => itemIndex !== index));
                      }}
                    />
                  </Flex>
                );
                return isInvalidReference ? (
                  <MyTooltip key={index} label={invalidReason} shouldWrapChildren={false}>
                    {row}
                  </MyTooltip>
                ) : (
                  row
                );
              })}
            </Grid>
          ) : (
            <Box fontSize={'sm'} fontWeight={'normal'} color={'myGray.500'}>
              {placeholder}
            </Box>
          )
        }
        value={arrayVal}
        list={list}
        onSelect={(e) => {
          onSelect(e as any);
        }}
        popDirection={popDirection}
        onOpenFunc={onOpenList}
        ButtonProps={ButtonProps}
      />
    );
  }, [
    arrayVal,
    ButtonProps,
    formatList,
    list,
    onOpenList,
    onSelect,
    placeholder,
    popDirection,
    t
  ]);

  return ArraySelector;
};
export const ReferSelector = <T extends boolean>(props: SelectProps<T>) => {
  return props.isArray ? (
    <MultipleReferenceSelector {...(props as SelectProps<true>)} />
  ) : (
    <SingleReferenceSelector {...(props as SelectProps<false>)} />
  );
};
