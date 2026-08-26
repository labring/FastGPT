import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getNodeAllSource, filterSelectableWorkflowNodeOutputs } from '@/web/core/workflow/utils';
import { isConfiguredReferenceValue } from '@/web/core/workflow/workflowCheck';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
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
  children: {
    label: string;
    value: string;
    valueType?: WorkflowIOValueTypeEnum;
  }[];
}[];

type CommonSelectProps = {
  placeholder?: string;
  list: ReferenceSelectList;
  // 不做类型过滤的可选输出列表，仅用于区分「来源已删除」和「类型不匹配」两种失效原因
  liveList?: ReferenceSelectList;
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
  onSelect,
  popDirection,
  ButtonProps
}: SelectProps<false>) => {
  const { t } = useSafeTranslation();

  const getSelectValue = useCallback(
    (value: ReferenceValueType, searchList: ReferenceSelectList) => {
      if (!value) return [];

      const firstColumn = searchList.find((item) => item.value === value[0]);
      if (!firstColumn) {
        return [];
      }
      const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
      if (!secondColumn) {
        return [];
      }
      return [firstColumn.label, secondColumn.label];
    },
    []
  );

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

    return (
      <MultipleRowSelect
        label={
          isValidSelect ? (
            <Flex py={1} pl={1} alignItems={'center'} fontSize={'sm'}>
              {nodeName}
              <MyIcon name={'common/rightArrowLight'} mx={0.5} w={'12px'} color={'myGray.500'} />
              {outputName}
            </Flex>
          ) : (
            <Box
              fontSize={'sm'}
              color={isInvalidReference ? 'red.500' : 'myGray.400'}
              title={isInvalidReference ? selectorVal?.join('.') : undefined}
            >
              {isInvalidReference
                ? isTypeMismatch
                  ? t('common:core.workflow.check.reference_type_mismatch')
                  : t('common:core.workflow.check.reference_deleted')
                : placeholder}
            </Box>
          )
        }
        value={selectorVal}
        list={list}
        onSelect={onSelect as any}
        popDirection={popDirection}
        ButtonProps={ButtonProps}
      />
    );
  }, [ButtonProps, getSelectValue, list, liveList, onSelect, placeholder, popDirection, t, value]);

  return ItemSelector;
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  liveList = [],
  onSelect,
  popDirection
}: SelectProps<true>) => {
  const { t } = useSafeTranslation();

  const getSelectValue = useCallback(
    (value: ReferenceValueType, searchList: ReferenceSelectList) => {
      if (!value) return [];

      const firstColumn = searchList.find((item) => item.value === value[0]);
      if (!firstColumn) {
        return [];
      }
      const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
      if (!secondColumn) {
        return [];
      }
      return [firstColumn.label, secondColumn.label];
    },
    []
  );

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
                return (
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
                    <Flex alignItems={'center'} flex={'1 0 0'} className="textEllipsis">
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
                        <Box title={rawValue?.join('.')}>
                          {isTypeMismatch
                            ? t('common:core.workflow.check.reference_type_mismatch')
                            : t('common:core.workflow.check.reference_deleted')}
                        </Box>
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
                        onSelect(value?.filter((_, i) => i !== index));
                      }}
                    />
                  </Flex>
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
          onSelect(e as any);
        }}
        popDirection={popDirection}
      />
    );
  }, [formatList, getSelectValue, list, liveList, onSelect, placeholder, popDirection, t, value]);

  return ArraySelector;
};
export const ReferSelector = <T extends boolean>(props: SelectProps<T>) => {
  return props.isArray ? (
    <MultipleReferenceSelector {...(props as SelectProps<true>)} />
  ) : (
    <SingleReferenceSelector {...(props as SelectProps<false>)} />
  );
};
