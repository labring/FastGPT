import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getNodeAllSource,
  isConfiguredReferenceValue,
  isWorkflowReferenceItem,
  filterSelectableWorkflowNodeOutputs,
  type WorkflowReferenceSourceNode
} from '@/web/core/workflow/utils';
import {
  getWorkflowReferenceSource,
  getWorkflowReferenceStatus
} from '@/web/core/workflow/referenceCheck';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType,
  WorkflowReferenceSnapshot
} from '@fastgpt/global/core/workflow/type/io';
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

const getReferenceListItem = (value: unknown, list: ReferenceSelectList) => {
  if (!isWorkflowReferenceItem(value)) return;

  const source = list.find((item) => item.value === value[0]);
  const output = source?.children.find((item) => item.value === value[1]);
  return source && output ? { source, output } : undefined;
};

const getSelectedReferenceLabels = (value: unknown, list: ReferenceSelectList) => {
  const reference = getReferenceListItem(value, list);
  return reference ? [reference.source.label, reference.output.label] : [];
};

/** 按当前选项或历史快照恢复失效引用的展示标签。 */
const getReferenceSnapshot = ({
  value,
  list,
  sourceNodes,
  referenceSnapshots,
  getNodeById
}: {
  value?: ReferenceItemValueType;
  list: ReferenceSelectList;
  sourceNodes?: WorkflowReferenceSourceNode[];
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) => {
  if (!isWorkflowReferenceItem(value)) return;

  const reference = getReferenceListItem(value, list);
  if (reference) {
    return {
      reference: value,
      sourceLabel: reference.source.sourceLabel,
      outputLabel: reference.output.outputLabel
    };
  }

  const { sourceLabel, sourceOutput } = getWorkflowReferenceSource({
    value,
    sourceNodes,
    getNodeById
  });
  if (sourceLabel && sourceOutput) {
    return {
      reference: value,
      sourceLabel,
      outputLabel: sourceOutput.label
    };
  }

  return referenceSnapshots?.find((item) => {
    const reference = item.reference;
    return (
      isWorkflowReferenceItem(reference) && reference[0] === value[0] && reference[1] === value[1]
    );
  });
};

const getInvalidReferenceReason = (
  code: ReturnType<typeof getWorkflowReferenceStatus>['code'],
  t: ReturnType<typeof useSafeTranslation>['t']
) =>
  code === 'invalid_reference_type'
    ? t('common:core.workflow.check.reference_type_mismatch')
    : code === 'unreachable_reference'
      ? t('common:core.workflow.check.reference_unreachable')
      : t('common:core.workflow.check.reference_deleted');

const ReferenceOutputLabel = ({
  sourceLabel,
  outputLabel,
  iconMargin = 0.5
}: {
  sourceLabel: React.ReactNode;
  outputLabel: React.ReactNode;
  iconMargin?: number;
}) => (
  <>
    {sourceLabel}
    <MyIcon name={'common/rightArrowLight'} mx={iconMargin} w={'12px'} color={'myGray.500'} />
    {outputLabel}
  </>
);

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
  sourceNodes?: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  popDirection?: 'top' | 'bottom';
  ButtonProps?: ButtonProps;
};
type SelectProps<T extends boolean> = CommonSelectProps & {
  isArray?: T;
  value?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType;
  onSelect: (val?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType) => void;
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
  const { referenceList, sourceNodes } = useMemoEnhance(() => {
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
          children: selectableOutputs.map((output) => ({
            label: t(output.label as any),
            value: output.id,
            outputLabel: output.label,
            valueType: output.valueType
          }))
        });
      }
    });

    return {
      referenceList,
      sourceNodes: sourceNodes.map((node) => ({
        nodeId: node.nodeId,
        sourceLabel: node.name,
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
    sourceNodes
  };
};

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useSafeTranslation();

  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const isArray = item.valueType?.includes('array') ?? false;

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const { referenceList, sourceNodes } = useReference({
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
  sourceNodes,
  valueType,
  referenceSnapshots,
  onSelect,
  popDirection,
  ButtonProps
}: SelectProps<false>) => {
  const { t } = useSafeTranslation();
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);

  const selectorVal = value as ReferenceItemValueType;
  const [nodeName, outputName] = getSelectedReferenceLabels(selectorVal, list);
  const status = getWorkflowReferenceStatus({
    value: selectorVal,
    valueType,
    sourceNodes,
    getNodeById
  });
  const isValidSelect = status.code === 'valid' && Boolean(nodeName && outputName);
  const isInvalidReference = isConfiguredReferenceValue(selectorVal) && !isValidSelect;
  const referenceOutputKey = getReferenceOutputKey(selectorVal);
  const referenceTitle = getReferenceValueTitle(selectorVal);
  const invalidReason = getInvalidReferenceReason(status.code, t);
  const invalidSnapshot = isInvalidReference
    ? getReferenceSnapshot({
        value: selectorVal,
        list,
        sourceNodes,
        referenceSnapshots,
        getNodeById
      })
    : undefined;

  const selector = (
    <MultipleRowSelect
      label={
        isValidSelect ? (
          <Flex py={1} pl={1} alignItems={'center'} fontSize={'sm'}>
            <ReferenceOutputLabel sourceLabel={nodeName} outputLabel={outputName} />
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
        onSelect(nextValue as ReferenceItemValueType | undefined);
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
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  sourceNodes,
  valueType,
  referenceSnapshots,
  onSelect,
  popDirection
}: SelectProps<true>) => {
  const { t } = useSafeTranslation();
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);

  // Get valid item and remove invalid item
  const formatList = useMemo(() => {
    if (!Array.isArray(value)) return [];

    return value.map((item) => {
      const [nodeName, outputName] = getSelectedReferenceLabels(item, list);
      const status = getWorkflowReferenceStatus({
        value: item,
        valueType,
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
  }, [getNodeById, list, sourceNodes, value, valueType]);

  const handleSelect = useCallback(
    (nextValue?: ReferenceArrayValueType) => {
      onSelect(nextValue);
    },
    [onSelect]
  );

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
              const isInvalidReference = isConfiguredReferenceValue(rawValue) && !isValidReference;
              const referenceOutputKey = getReferenceOutputKey(rawValue);
              const referenceTitle = getReferenceValueTitle(rawValue);
              const invalidReason = getInvalidReferenceReason(status.code, t);
              const invalidSnapshot = isInvalidReference
                ? getReferenceSnapshot({
                    value: rawValue,
                    list,
                    sourceNodes,
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
                      <ReferenceOutputLabel
                        sourceLabel={nodeName}
                        outputLabel={outputName}
                        iconMargin={1}
                      />
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
};
export const ReferSelector = <T extends boolean>(props: SelectProps<T>) => {
  return props.isArray ? (
    <MultipleReferenceSelector {...(props as SelectProps<true>)} />
  ) : (
    <SingleReferenceSelector {...(props as SelectProps<false>)} />
  );
};
