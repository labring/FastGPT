import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getNodeAllSource,
  getWorkflowReferenceItems,
  getWorkflowReferenceStatus,
  isConfiguredReferenceValue,
  filterSelectableWorkflowNodeOutputs,
  type WorkflowReferenceSourceNode
} from '@/web/core/workflow/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
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
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
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
  referenceSnapshots,
  getNodeById
}: {
  value?: ReferenceItemValueType;
  list: ReferenceSelectList;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) => {
  if (!isConfiguredReferenceItem(value)) return;

  return (
    getReferenceSnapshotFromList({ value, list }) ??
    getReferenceSnapshotFromSource({ value, getNodeById }) ??
    referenceSnapshots?.find((item) => isSameReference(item.reference, value))
  );
};

const formatReferenceSnapshots = ({
  value,
  list,
  referenceSnapshots,
  getNodeById
}: {
  value?: ReferenceValueType;
  list: ReferenceSelectList;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) =>
  getWorkflowReferenceItems(value)
    .map((item) =>
      getReferenceSnapshot({
        value: item,
        list,
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
  sourceNodeIds?: string[];
  sourceNodes?: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
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
  const { referenceList, sourceNodeIds, sourceNodes } = useMemoEnhance(() => {
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
    });

    return {
      referenceList,
      sourceNodeIds: sourceNodes.map((node) => node.nodeId),
      sourceNodes: sourceNodes.map((node) => ({
        nodeId: node.nodeId,
        outputs: node.outputs,
        catchError: node.catchError
      }))
    };
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
    sourceNodeIds,
    sourceNodes
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

  const { referenceList, sourceNodeIds, sourceNodes } = useReference({
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
      sourceNodeIds={sourceNodeIds}
      sourceNodes={sourceNodes}
      valueType={item.valueType}
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
  sourceNodeIds,
  sourceNodes,
  valueType,
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

  const ItemSelector = useMemo(() => {
    const selectorVal = value as ReferenceItemValueType;
    const [nodeName, outputName] = getSelectValue(selectorVal, list);
    const status = getWorkflowReferenceStatus({
      value: selectorVal,
      valueType,
      sourceNodeIds,
      sourceNodes,
      getNodeById
    });
    const isValidSelect = status.code === 'valid' && Boolean(nodeName && outputName);
    const isInvalidReference = isConfiguredReferenceValue(selectorVal) && !isValidSelect;
    const referenceOutputKey = getReferenceOutputKey(selectorVal);
    const referenceTitle = getReferenceValueTitle(selectorVal);
    const invalidReason =
      status.code === 'invalid_reference_type'
        ? t('common:core.workflow.check.reference_type_mismatch')
        : status.code === 'unreachable_reference'
          ? t('common:core.workflow.check.reference_unreachable')
          : t('common:core.workflow.check.reference_deleted');
    const invalidSnapshot = isInvalidReference
      ? getReferenceSnapshot({
          value: selectorVal,
          list,
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
    onSelect,
    placeholder,
    popDirection,
    referenceSnapshots,
    sourceNodeIds,
    sourceNodes,
    t,
    value,
    valueType
  ]);

  return ItemSelector;
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  sourceNodeIds,
  sourceNodes,
  valueType,
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
      const status = getWorkflowReferenceStatus({
        value: item,
        valueType,
        sourceNodeIds,
        sourceNodes,
        getNodeById
      });
      return {
        rawValue: item,
        nodeName,
        outputName,
        status
      };
    });
  }, [getNodeById, getSelectValue, list, sourceNodeIds, sourceNodes, value, valueType]);

  const handleSelect = useCallback(
    (nextValue?: ReferenceArrayValueType) => {
      const snapshots = formatReferenceSnapshots({
        value: nextValue,
        list,
        referenceSnapshots,
        getNodeById
      });
      onSelect(nextValue, snapshots.length ? snapshots : undefined);
    },
    [getNodeById, list, onSelect, referenceSnapshots]
  );

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
              {formatList.map(({ rawValue, nodeName, outputName, status }, index) => {
                const isValidReference = status.code === 'valid' && Boolean(nodeName && outputName);
                const isInvalidReference =
                  isConfiguredReferenceValue(rawValue) && !isValidReference;
                const referenceOutputKey = getReferenceOutputKey(rawValue);
                const referenceTitle = getReferenceValueTitle(rawValue);
                const invalidReason =
                  status.code === 'invalid_reference_type'
                    ? t('common:core.workflow.check.reference_type_mismatch')
                    : status.code === 'unreachable_reference'
                      ? t('common:core.workflow.check.reference_unreachable')
                      : t('common:core.workflow.check.reference_deleted');
                const invalidSnapshot = isInvalidReference
                  ? getReferenceSnapshot({
                      value: rawValue,
                      list,
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
    getNodeById,
    list,
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
