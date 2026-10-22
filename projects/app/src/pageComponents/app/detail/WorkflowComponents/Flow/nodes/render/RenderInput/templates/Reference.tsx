import {
  filterSelectableWorkflowNodeOutputs,
  DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES,
  getHandleId
} from '@fastgpt/global/common/workflow/reference';
import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getNodeAllSource } from '@/web/core/workflow/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import {
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { Position } from 'reactflow';
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

type CommonSelectProps = {
  placeholder?: string;
  list: {
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
  includeChildren,
  excludeValueTypes
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  // Include the container's own children as reference sources.
  includeChildren?: boolean;
  excludeValueTypes?: WorkflowIOValueTypeEnum[];
}) => {
  const { t } = useSafeTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const { getNodeById, childrenNodeIdListMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  // 获取可选的变量列表
  const referenceList = useMemoEnhance(() => {
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

    // 转换为 select 的数据结构
    const list: CommonSelectProps['list'] = sourceNodes
      .map((node) => {
        return {
          label: (
            <Flex alignItems={'center'}>
              <Avatar src={node.avatar} w={isArray ? '1rem' : '1.05rem'} borderRadius={'xs'} />
              <Box ml={1}>{node.name}</Box>
            </Flex>
          ),
          value: node.nodeId,
          name: node.name,
          avatar: node.avatar,
          children: filterSelectableWorkflowNodeOutputs({
            outputs: node.outputs,
            valueType,
            catchError: node.catchError,
            excludeValueTypes
          }).map((output) => {
            return {
              label: t(output.label as any),
              value: output.id,
              valueType: output.valueType
            };
          })
        };
      })
      .filter((item) => item.children.length > 0);

    return list;
  }, [
    nodeId,
    getNodeById,
    edges,
    appDetail.chatConfig,
    t,
    valueType,
    includeChildren,
    childrenNodeIdListMap,
    excludeValueTypes
  ]);

  return {
    referenceList
  };
};

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useSafeTranslation();

  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const isDynamicOptionsInput =
    getNodeById(nodeId)?.flowNodeType === FlowNodeTypeEnum.userSelect &&
    item.key === NodeInputKeyEnum.userSelectOptions;
  const isArray = isDynamicOptionsInput || (item.valueType?.includes('array') ?? false);

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

  const { referenceList } = useReference({
    nodeId,
    valueType: item.valueType,
    excludeValueTypes: isDynamicOptionsInput ? DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES : undefined
  });

  const popDirection = useMemo(() => {
    const node = getNodeById(nodeId);
    if (!node) return 'bottom';
    return isNestedParentNodeType(node.flowNodeType) ? 'top' : 'bottom';
  }, [nodeId, getNodeById]);

  return (
    <Box position={'relative'}>
      <ReferSelector
        placeholder={
          t(item.referencePlaceholder as any) ||
          (isDynamicOptionsInput
            ? t('workflow:please_select_variable')
            : t('common:select_reference_variable'))
        }
        list={referenceList}
        value={item.value}
        onSelect={onSelect}
        popDirection={popDirection}
        isArray={isArray}
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
  );
};

export default React.memo(Reference);

const SingleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection,
  ButtonProps
}: SelectProps<false>) => {
  const getSelectValue = useCallback(
    (value: ReferenceValueType) => {
      if (!value || !Array.isArray(value)) return undefined;

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
    [list]
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
    const selectorVal = (Array.isArray(value) ? value : []) as ReferenceItemValueType;
    const selected = getSelectValue(selectorVal);

    return (
      <MultipleRowSelect
        label={
          selected ? (
            <Flex
              alignItems={'center'}
              minW={0}
              w={'100%'}
              overflow={'hidden'}
              fontSize={'sm'}
              fontWeight={'normal'}
              data-preserve-width
            >
              {!!selected.avatar && (
                <Avatar src={selected.avatar} w={'1.05rem'} borderRadius={'xs'} flexShrink={0} />
              )}
              <Box
                data-preserve-width
                ml={selected.avatar ? 1 : 0}
                minW={0}
                flex={1}
                overflow={'hidden'}
                textOverflow={'ellipsis'}
                whiteSpace={'nowrap'}
              >
                {selected.text}
              </Box>
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
        ButtonProps={ButtonProps}
      />
    );
  }, [ButtonProps, getSelectValue, list, onSelect, placeholder, popDirection, value]);

  return ItemSelector;
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection,
  ButtonProps
}: SelectProps<true>) => {
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

  // Get valid item and remove invalid item
  const formatList = useMemo(() => {
    if (!value || !Array.isArray(value)) return [];

    return value.map((item) => {
      const [nodeName, outputName] = getSelectValue(item);
      return {
        rawValue: item,
        nodeName,
        outputName
      };
    });
  }, [getSelectValue, value]);

  const validList = useMemo(() => {
    return formatList.filter((item) => item.nodeName && item.outputName);
  }, [formatList]);
  const validValueList = useMemo(() => {
    return validList.map((item) => item.rawValue);
  }, [validList]);

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
          validList.length > 0 ? (
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
              {validList.map(({ nodeName, outputName }, index) => {
                return (
                  <Flex
                    key={index}
                    w={'100%'}
                    alignItems={'center'}
                    bg={'primary.50'}
                    color={'myGray.900'}
                    py={1}
                    px={1.5}
                    rounded={'sm'}
                  >
                    <Flex alignItems={'center'} flex={'1 0 0'} className="textEllipsis">
                      {nodeName}
                      <MyIcon
                        name={'common/rightArrowLight'}
                        mx={1}
                        w={'12px'}
                        color={'myGray.500'}
                      />
                      {outputName}
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
                        onSelect(validValueList.filter((_, i) => i !== index));
                      }}
                    />
                  </Flex>
                );
              })}
            </Grid>
          ) : (
            <Box fontSize={'sm'} fontWeight={'normal'} color={'myGray.500'}>
              {placeholder}
            </Box>
          )
        }
        value={validValueList}
        list={list}
        onSelect={(e) => {
          onSelect(e as any);
        }}
        popDirection={popDirection}
        ButtonProps={ButtonProps}
      />
    );
  }, [ButtonProps, validList, validValueList, list, onSelect, placeholder, popDirection]);

  return ArraySelector;
};
export const ReferSelector = <T extends boolean>(props: SelectProps<T>) => {
  return props.isArray ? (
    <MultipleReferenceSelector {...(props as SelectProps<true>)} />
  ) : (
    <SingleReferenceSelector {...(props as SelectProps<false>)} />
  );
};
