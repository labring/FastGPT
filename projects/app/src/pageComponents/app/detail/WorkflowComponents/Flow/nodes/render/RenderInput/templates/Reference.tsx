import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getNodeAllSource, filterSelectableWorkflowNodeOutputs } from '@/web/core/workflow/utils';
import { isConfiguredReferenceValue } from '@/web/core/workflow/workflowCheck';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  WorkflowIOValueTypeEnum,
  VARIABLE_NODE_ID,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType,
  WorkflowReferenceSnapshot
} from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import {
  isNestedParentNodeType,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

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

/**
 * 判断引用指向的来源节点和输出是否仍存在（不依赖连线关系）。
 * 选择器列表只包含当前连线范围内的来源，凭此区分「来源已删除」和「断边导致来源不可达」：
 * 来源仍存在但不在可选列表中，说明是连线断开导致不可选。
 */
const referenceSourceStillExists = ({
  value,
  getNodeById
}: {
  value?: ReferenceItemValueType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) => {
  if (!isConfiguredReferenceItem(value)) return false;
  const [refNodeId, refOutputId] = value;
  if (!refNodeId || !refOutputId || refNodeId === VARIABLE_NODE_ID) return false;

  const sourceNode = getNodeById(refNodeId);
  if (!sourceNode) return false;

  const output = sourceNode.outputs.find((item) => item.id === refOutputId);
  if (!output || output.invalid === true || output.id === NodeOutputKeyEnum.addOutputParam) {
    return false;
  }
  if (output.type === FlowNodeOutputTypeEnum.error) return sourceNode.catchError === true;

  return true;
};

type ReferenceSelectList = {
  label: string | React.ReactNode;
  value: string;
  sourceLabel?: string;
  children: {
    label: string;
    value: string;
    outputLabel?: string;
    valueType?: WorkflowIOValueTypeEnum;
  }[];
}[];

const isConfiguredReferenceItem = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  typeof value[0] === 'string' &&
  value[0].length > 0 &&
  typeof value[1] === 'string' &&
  value[1].length > 0;

const isSameReference = (left?: ReferenceItemValueType, right?: ReferenceItemValueType): boolean =>
  isConfiguredReferenceItem(left) &&
  isConfiguredReferenceItem(right) &&
  left[0] === right[0] &&
  left[1] === right[1];

const getReferenceValueTitle = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined && item !== null)
      .map((item) => String(item))
      .join('.');
  }
  return typeof value === 'string' ? value : undefined;
};

const getReferenceOutputKey = (value: unknown) => {
  if (Array.isArray(value) && typeof value[1] === 'string') return value[1];
  return typeof value === 'string' ? value : undefined;
};

const getReferenceSnapshotFromList = ({
  value,
  list
}: {
  value: ReferenceItemValueType;
  list: ReferenceSelectList;
}): WorkflowReferenceSnapshot | undefined => {
  if (!isConfiguredReferenceItem(value)) return;

  const source = list.find((item) => item.value === value[0]);
  const output = source?.children.find((item) => item.value === value[1]);
  if (!source || !output) return;

  return {
    reference: value,
    sourceLabel: source.sourceLabel,
    outputLabel: output.outputLabel
  };
};

const getReferenceSnapshotFromSource = ({
  value,
  getNodeById
}: {
  value: ReferenceItemValueType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}): WorkflowReferenceSnapshot | undefined => {
  if (!isConfiguredReferenceItem(value) || value[0] === VARIABLE_NODE_ID) return;

  const sourceNode = getNodeById(value[0]);
  const output = sourceNode?.outputs.find((item) => item.id === value[1]);
  if (!sourceNode || !output) return;

  return {
    reference: value,
    sourceLabel: sourceNode.name,
    outputLabel: output.label
  };
};

const getReferenceSnapshot = ({
  value,
  list,
  liveList,
  referenceSnapshots,
  getNodeById
}: {
  value?: ReferenceItemValueType;
  list: ReferenceSelectList;
  liveList: ReferenceSelectList;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) => {
  if (!isConfiguredReferenceItem(value)) return;

  return (
    getReferenceSnapshotFromList({ value, list }) ??
    getReferenceSnapshotFromList({ value, list: liveList }) ??
    getReferenceSnapshotFromSource({ value, getNodeById }) ??
    referenceSnapshots?.find((item) => isSameReference(item.reference, value))
  );
};

const getReferenceItems = (value?: ReferenceValueType): ReferenceItemValueType[] => {
  if (isConfiguredReferenceItem(value)) return [value];
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is ReferenceItemValueType => isConfiguredReferenceItem(item));
};

const formatReferenceSnapshots = ({
  value,
  list,
  liveList,
  referenceSnapshots,
  getNodeById
}: {
  value?: ReferenceValueType;
  list: ReferenceSelectList;
  liveList: ReferenceSelectList;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) =>
  getReferenceItems(value)
    .map((item) =>
      getReferenceSnapshot({
        value: item,
        list,
        liveList,
        referenceSnapshots,
        getNodeById
      })
    )
    .filter((item): item is WorkflowReferenceSnapshot => !!item);

const ReferenceSnapshotLabel = ({
  snapshot,
  fallback,
  t
}: {
  snapshot?: WorkflowReferenceSnapshot;
  fallback?: string;
  t: ReturnType<typeof useSafeTranslation>['t'];
}) => {
  const sourceLabel = snapshot?.sourceLabel;
  const outputLabel = snapshot?.outputLabel ? t(snapshot.outputLabel as any) : fallback;

  if (sourceLabel && outputLabel) {
    return (
      <>
        {sourceLabel}
        <MyIcon name={'common/rightArrowLight'} mx={0.5} w={'12px'} color={'myGray.500'} />
        {outputLabel}
      </>
    );
  }

  return <>{outputLabel || sourceLabel || fallback}</>;
};

type CommonSelectProps = {
  placeholder?: string;
  list: ReferenceSelectList;
  // 不做类型过滤的可选输出列表，仅用于区分「来源已删除」和「类型不匹配」两种失效原因
  liveList?: ReferenceSelectList;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  popDirection?: 'top' | 'bottom';
  ButtonProps?: ButtonProps;
};
type SelectProps<T extends boolean> = CommonSelectProps & {
  isArray?: T;
  value?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType;
  onSelect: (
    val?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType,
    snapshots?: WorkflowReferenceSnapshot[]
  ) => void;
};

export const useReference = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  includeChildren
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  // Include the container's own children as reference sources.
  includeChildren?: boolean;
}) => {
  const { t } = useSafeTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const { getNodeById, childrenNodeIdListMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  // 获取可选的变量列表
  const { referenceList, liveReferenceList } = useMemoEnhance(() => {
    const sourceNodes = getNodeAllSource({
      nodeId,
      getNodeById,
      edges: edges,
      chatConfig: appDetail.chatConfig,
      t,
      includeChildren,
      childrenNodeIdListMap
    });

    const isArray = valueType?.includes('array');

    const referenceList: ReferenceSelectList = [];
    // 失效原因分类专用：类型不受限时的可选输出；来源仍在这里但不在 referenceList 中即为类型不匹配
    const liveReferenceList: ReferenceSelectList = [];

    sourceNodes.forEach((node) => {
      const label = (
        <Flex alignItems={'center'}>
          <Avatar src={node.avatar} w={isArray ? '1rem' : '1.05rem'} borderRadius={'xs'} />
          <Box ml={1}>{node.name}</Box>
        </Flex>
      );
      const toChildren = (outputs: FlowNodeOutputItemType[]) =>
        outputs.map((output) => ({
          label: t(output.label as any),
          value: output.id,
          outputLabel: output.label,
          valueType: output.valueType
        }));

      // 转换为 select 的数据结构
      const selectableOutputs = filterSelectableWorkflowNodeOutputs({
        outputs: node.outputs,
        valueType,
        catchError: node.catchError
      });
      if (selectableOutputs.length > 0) {
        referenceList.push({
          label,
          value: node.nodeId,
          sourceLabel: node.name,
          children: toChildren(selectableOutputs)
        });
      }

      const liveOutputs = filterSelectableWorkflowNodeOutputs({
        outputs: node.outputs,
        valueType: WorkflowIOValueTypeEnum.any,
        catchError: node.catchError
      });
      if (liveOutputs.length > 0) {
        liveReferenceList.push({
          label,
          value: node.nodeId,
          sourceLabel: node.name,
          children: toChildren(liveOutputs)
        });
      }
    });

    return { referenceList, liveReferenceList };
  }, [
    nodeId,
    getNodeById,
    edges,
    appDetail.chatConfig,
    t,
    valueType,
    includeChildren,
    childrenNodeIdListMap
  ]);

  return {
    referenceList,
    liveReferenceList
  };
};

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useSafeTranslation();

  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const isArray = item.valueType?.includes('array') ?? false;

  const onSelect = useCallback(
    (e?: ReferenceValueType, snapshots?: WorkflowReferenceSnapshot[]) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e,
          referenceSnapshots: snapshots?.length ? snapshots : undefined
        }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const { referenceList, liveReferenceList } = useReference({
    nodeId,
    valueType: item.valueType
  });

  const popDirection = useMemo(() => {
    const node = getNodeById(nodeId);
    if (!node) return 'bottom';
    return isNestedParentNodeType(node.flowNodeType) ? 'top' : 'bottom';
  }, [nodeId, getNodeById]);

  return (
    <ReferSelector
      placeholder={t(item.referencePlaceholder as any) || t('common:select_reference_variable')}
      list={referenceList}
      liveList={liveReferenceList}
      referenceSnapshots={item.referenceSnapshots}
      value={item.value}
      onSelect={onSelect}
      popDirection={popDirection}
      isArray={isArray}
    />
  );
};

export default React.memo(Reference);

const SingleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  liveList = [],
  referenceSnapshots,
  onSelect,
  popDirection,
  ButtonProps
}: SelectProps<false>) => {
  const { t } = useSafeTranslation();
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);

  const getSelectValue = useCallback((value: unknown, searchList: ReferenceSelectList) => {
    if (!isConfiguredReferenceItem(value)) return [];

    const firstColumn = searchList.find((item) => item.value === value[0]);
    if (!firstColumn) {
      return [];
    }
    const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
    if (!secondColumn) {
      return [];
    }
    return [firstColumn.label, secondColumn.label];
  }, []);

  // Adapt array type from old version
  useEffect(() => {
    if (
      Array.isArray(value) &&
      // @ts-ignore
      value.length === 1 &&
      Array.isArray(value[0]) &&
      value[0].length === 2
    ) {
      // @ts-ignore
      onSelect(value[0]);
    }
  }, [value, onSelect]);

  const ItemSelector = useMemo(() => {
    const selectorVal = value as ReferenceItemValueType;
    const [nodeName, outputName] = getSelectValue(selectorVal, list);
    const isValidSelect = Boolean(nodeName && outputName);
    const isInvalidReference = isConfiguredReferenceValue(selectorVal) && !isValidSelect;
    // 来源仍在无类型过滤列表中即为类型不匹配，否则按来源已删除提示
    const [liveNodeName, liveOutputName] = isInvalidReference
      ? getSelectValue(selectorVal, liveList)
      : [];
    const isTypeMismatch = isInvalidReference && Boolean(liveNodeName && liveOutputName);
    // 来源节点仍存在但不在可选列表中，即断边导致不可达；否则按来源已删除提示
    const isSourceUnreachable =
      isInvalidReference &&
      !isTypeMismatch &&
      referenceSourceStillExists({ value: selectorVal, getNodeById });
    const referenceOutputKey = getReferenceOutputKey(selectorVal);
    const referenceTitle = getReferenceValueTitle(selectorVal);
    const invalidReason = isTypeMismatch
      ? t('common:core.workflow.check.reference_type_mismatch')
      : isSourceUnreachable
        ? t('common:core.workflow.check.reference_unreachable')
        : t('common:core.workflow.check.reference_deleted');
    const invalidSnapshot = isInvalidReference
      ? getReferenceSnapshot({
          value: selectorVal,
          list,
          liveList,
          referenceSnapshots,
          getNodeById
        })
      : undefined;

    const selector = (
      <MultipleRowSelect
        label={
          isValidSelect ? (
            <Flex py={1} pl={1} alignItems={'center'} fontSize={'sm'}>
              {nodeName}
              <MyIcon name={'common/rightArrowLight'} mx={0.5} w={'12px'} color={'myGray.500'} />
              {outputName}
            </Flex>
          ) : isInvalidReference ? (
            <Flex py={1} pl={1} alignItems={'center'} fontSize={'sm'}>
              <Box title={referenceTitle} color={'red.500'} display={'flex'} alignItems={'center'}>
                <ReferenceSnapshotLabel
                  snapshot={invalidSnapshot}
                  fallback={referenceOutputKey}
                  t={t}
                />
              </Box>
            </Flex>
          ) : (
            <Box fontSize={'sm'} color={'myGray.400'}>
              {placeholder}
            </Box>
          )
        }
        value={selectorVal}
        list={list}
        onSelect={(nextValue) => {
          const snapshots = formatReferenceSnapshots({
            value: nextValue as ReferenceValueType | undefined,
            list,
            liveList,
            referenceSnapshots,
            getNodeById
          });
          onSelect(
            nextValue as ReferenceItemValueType | undefined,
            snapshots.length ? snapshots : undefined
          );
        }}
        popDirection={popDirection}
        ButtonProps={
          isInvalidReference
            ? {
                ...ButtonProps,
                borderColor: 'red.500',
                color: 'red.500',
                _hover: { borderColor: 'red.400' }
              }
            : ButtonProps
        }
      />
    );

    return isInvalidReference ? (
      <MyTooltip label={invalidReason} shouldWrapChildren={false}>
        <Box w={'full'}>{selector}</Box>
      </MyTooltip>
    ) : (
      selector
    );
  }, [
    ButtonProps,
    getSelectValue,
    getNodeById,
    list,
    liveList,
    onSelect,
    placeholder,
    popDirection,
    referenceSnapshots,
    t,
    value
  ]);

  return ItemSelector;
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  liveList = [],
  referenceSnapshots,
  onSelect,
  popDirection
}: SelectProps<true>) => {
  const { t } = useSafeTranslation();
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);

  const getSelectValue = useCallback((value: unknown, searchList: ReferenceSelectList) => {
    if (!isConfiguredReferenceItem(value)) return [];

    const firstColumn = searchList.find((item) => item.value === value[0]);
    if (!firstColumn) {
      return [];
    }
    const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
    if (!secondColumn) {
      return [];
    }
    return [firstColumn.label, secondColumn.label];
  }, []);

  // Get valid item and remove invalid item
  const formatList = useMemo(() => {
    if (!value || !Array.isArray(value)) return [];

    return value.map((item) => {
      const [nodeName, outputName] = getSelectValue(item, list);
      return {
        rawValue: item,
        nodeName,
        outputName
      };
    });
  }, [getSelectValue, list, value]);

  const handleSelect = useCallback(
    (nextValue?: ReferenceArrayValueType) => {
      const snapshots = formatReferenceSnapshots({
        value: nextValue,
        list,
        liveList,
        referenceSnapshots,
        getNodeById
      });
      onSelect(nextValue, snapshots.length ? snapshots : undefined);
    },
    [getNodeById, list, liveList, onSelect, referenceSnapshots]
  );

  useEffect(() => {
    // Adapt array type from old version
    if (Array.isArray(value) && typeof value[0] === 'string') {
      // @ts-ignore
      handleSelect([value]);
    }
  }, [formatList, handleSelect, value]);

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
              _hover={{
                '.delete': {
                  visibility: 'visible'
                }
              }}
            >
              {formatList.map(({ rawValue, nodeName, outputName }, index) => {
                const isValidReference = Boolean(nodeName && outputName);
                const isInvalidReference =
                  isConfiguredReferenceValue(rawValue) && !isValidReference;
                // 多选失效项区分原因：来源仍在（无类型过滤列表可命中）为类型不匹配，否则为已删除
                const [liveNodeName, liveOutputName] = isInvalidReference
                  ? getSelectValue(rawValue, liveList)
                  : [];
                const isTypeMismatch =
                  isInvalidReference && Boolean(liveNodeName && liveOutputName);
                // 来源节点仍存在但不在可选列表中，即断边导致不可达；否则按来源已删除提示
                const isSourceUnreachable =
                  isInvalidReference &&
                  !isTypeMismatch &&
                  referenceSourceStillExists({ value: rawValue, getNodeById });
                const referenceOutputKey = getReferenceOutputKey(rawValue);
                const referenceTitle = getReferenceValueTitle(rawValue);
                const invalidReason = isTypeMismatch
                  ? t('common:core.workflow.check.reference_type_mismatch')
                  : isSourceUnreachable
                    ? t('common:core.workflow.check.reference_unreachable')
                    : t('common:core.workflow.check.reference_deleted');
                const invalidSnapshot = isInvalidReference
                  ? getReferenceSnapshot({
                      value: rawValue,
                      list,
                      liveList,
                      referenceSnapshots,
                      getNodeById
                    })
                  : undefined;
                const row = (
                  <Flex
                    key={index}
                    w={'100%'}
                    alignItems={'center'}
                    bg={isInvalidReference ? 'red.50' : 'primary.50'}
                    color={isInvalidReference ? 'red.500' : 'myGray.900'}
                    py={1}
                    px={1.5}
                    rounded={'sm'}
                  >
                    <Flex
                      alignItems={'center'}
                      flex={'1 0 0'}
                      className="textEllipsis"
                      title={isInvalidReference ? referenceTitle : undefined}
                    >
                      {isValidReference ? (
                        <>
                          {nodeName}
                          <MyIcon
                            name={'common/rightArrowLight'}
                            mx={1}
                            w={'12px'}
                            color={'myGray.500'}
                          />
                          {outputName}
                        </>
                      ) : isInvalidReference ? (
                        <ReferenceSnapshotLabel
                          snapshot={invalidSnapshot}
                          fallback={referenceOutputKey}
                          t={t}
                        />
                      ) : (
                        <Box color={'myGray.400'}>{placeholder}</Box>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(value?.filter((_, i) => i !== index));
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
            <Box fontSize={'sm'} color={'myGray.400'}>
              {placeholder}
            </Box>
          )
        }
        value={value as any}
        list={list}
        onSelect={(e) => {
          handleSelect(e as ReferenceArrayValueType);
        }}
        popDirection={popDirection}
      />
    );
  }, [
    formatList,
    getSelectValue,
    getNodeById,
    list,
    liveList,
    handleSelect,
    placeholder,
    popDirection,
    referenceSnapshots,
    t,
    value
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
