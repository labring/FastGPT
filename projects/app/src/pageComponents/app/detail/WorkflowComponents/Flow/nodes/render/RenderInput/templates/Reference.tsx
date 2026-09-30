import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  filterSelectableWorkflowNodeOutputs,
  getNodeAllSource,
  type WorkflowGraphEdge
} from '@/web/core/workflow/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  FlowNodeInputItemType,
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import type {
  WorkflowFieldSnapshot,
  WorkflowReferenceStatus,
  WorkflowSnapshot
} from '@fastgpt/global/core/workflow/editor/types';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  getWorkflowReferenceItems,
  isConfiguredReferenceValue
} from '@fastgpt/global/core/workflow/editor/utils';
import type { TFunction } from 'next-i18next';
import dynamic from 'next/dynamic';
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import { useWorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import { useField } from '@/web/core/workflow/editor';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';
import {
  useDocumentGetNodeById,
  useGraphQueries,
  useNodeWorkflowDocument,
  useWorkflowSnapshotGetter
} from '../../useWorkflowDocument';

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
  /** 懒加载列表：打开选择器时计算一次；已选内容的展示来自当前字段 scope。 */
  onOpenList?: () => void;
};
type SelectProps<T extends boolean> = CommonSelectProps & {
  isArray?: T;
  value?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType;
  onSelect: (val?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType) => void;
};

/**
 * 计算某节点当前可引用的来源列表：普通模块纯函数，只读文档图查询面。
 * 不进 Context、不建订阅，由调用方决定何时计算（常驻派生列表或打开选择器时一次性计算）。
 */
export const getReferenceList = ({
  workflow,
  getNodeById,
  getChildNodeIds,
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  includeChildren,
  t,
  getIncomingEdges
}: {
  /** 语义快照：只取 edges 与 chatConfig；按 id 查节点走 port 的 getNode。 */
  workflow: WorkflowSnapshot;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  /** 容器的直接子节点，来自 Runtime 图查询；不传则不展开子工作流。 */
  getChildNodeIds?: (parentId: string) => readonly string[];
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  /** 容器节点（loopRun）需要引用自身子工作流的输出时传 true。 */
  includeChildren?: boolean;
  t: TFunction;
  /** Runtime 入边索引；传了上游遍历就是 O(入度) 而不是每个节点全量扫一遍边。 */
  getIncomingEdges?: (nodeId: string) => readonly WorkflowGraphEdge[];
}): ReferenceListItem[] => {
  const sourceNodes = getNodeAllSource({
    nodeId,
    getNodeById,
    edges: workflow.edges,
    // 只读快照与纯函数入参只差 readonly 修饰，这里只做引用传递，不写回文档。
    chatConfig: workflow.chatConfig as AppChatConfigType,
    t,
    includeChildren,
    getChildNodeIds,
    getIncomingEdges
  });

  const isArray = valueType?.includes('array');

  // 转换为 select 的数据结构
  return sourceNodes
    .map((node) => ({
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
        catchError: node.catchError
      }).map((output) => ({
        label: t(output.label as any),
        value: output.id,
        valueType: output.valueType
      }))
    }))
    .filter((item) => item.children.length > 0);
};

/**
 * 常驻的可用引用列表：只在本节点或其上游来源闭包变化时重算，无关字段提交不带动。
 * 已选内容按 list 解析展示，因此列表必须常驻；只在打开时计算的场景用 useLazyReferenceList。
 */
export const useReference = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  includeChildren
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  includeChildren?: boolean;
}) => {
  const { t } = useSafeTranslation();
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId, includeChildren });

  const referenceList = useMemo(
    () =>
      workflow
        ? getReferenceList({
            workflow,
            getNodeById,
            getChildNodeIds: graph?.getChildNodeIds,
            nodeId,
            valueType,
            includeChildren,
            t,
            getIncomingEdges: graph?.getIncomingEdges
          })
        : [],
    [workflow, getNodeById, graph, nodeId, valueType, includeChildren, t]
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
  const getWorkflow = useWorkflowSnapshotGetter();
  // 两个都是非订阅读取：懒加载列表只在打开选择器时算一次，组件本身不随文档变化重渲染。
  const getNodeById = useDocumentGetNodeById();
  const graph = useGraphQueries();
  const [referenceList, setReferenceList] = useState<ReferenceListItem[]>([]);

  const loadReferenceList = useCallback(() => {
    const workflow = getWorkflow();
    if (!workflow) return;
    setReferenceList(
      getReferenceList({
        workflow,
        getNodeById,
        getChildNodeIds: graph?.getChildNodeIds,
        nodeId,
        valueType,
        includeChildren,
        t,
        getIncomingEdges: graph?.getIncomingEdges
      })
    );
  }, [getWorkflow, getNodeById, graph, includeChildren, nodeId, t, valueType]);

  return { referenceList, loadReferenceList };
};

/**
 * 引用选择输入模板：写入只提交字段值（updateField），来源与已选内容都从字段句柄读，
 * 因此编辑只刷新当前字段订阅，不触发全图重算。
 */
const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useSafeTranslation();
  const field = useField(nodeId, item.key, 'input');
  const currentInput = (field?.data.input ?? item) as FlowNodeInputItemType;
  const getWorkflow = useWorkflowSnapshotGetter();
  const { referenceList, loadReferenceList } = useLazyReferenceList({
    nodeId,
    valueType: currentInput.valueType
  });

  const isArray = currentInput.valueType?.includes('array') ?? false;

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      field?.setValue(e);
    },
    [field]
  );

  const flowNodeType = getWorkflow()?.nodes.find((node) => node.nodeId === nodeId)?.flowNodeType;
  // 嵌套容器节点（loop/parallelRun/loopRun）里的下拉向上展开，避免被子节点覆盖。
  const popDirection = useMemo(
    () => (flowNodeType && isNestedParentNodeType(flowNodeType) ? 'top' : 'bottom'),
    [flowNodeType]
  );

  return (
    <WorkflowFieldScope nodeId={nodeId} fieldKey={currentInput.key}>
      <ReferSelector
        placeholder={
          t(currentInput.referencePlaceholder as any) || t('common:select_reference_variable')
        }
        list={referenceList}
        value={currentInput.value}
        onSelect={onSelect}
        popDirection={popDirection}
        isArray={isArray}
        onOpenList={loadReferenceList}
      />
    </WorkflowFieldScope>
  );
};

export default React.memo(Reference);

const getReferenceStatus = (
  references: WorkflowFieldSnapshot['references'] | undefined,
  value: unknown
) => {
  const reference = getWorkflowReferenceItems(value)[0];
  if (!reference) return undefined;
  return references?.find((status) => {
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
  onOpenList
}: SelectProps<false>) => {
  // runtime 只发 i18n key 或字面量，展示名统一在渲染层过一遍 t。
  const { t } = useSafeTranslation();
  const references = useWorkflowReferenceScope();
  const getSelectValue = useCallback(
    (value: ReferenceValueType) => {
      if (!value) return undefined;

      // 给出字段引用状态时按状态展示：来源被删除时状态里带的是 Reference Snapshot 的
      // 历史名字与图标，因此失效引用同样可读，只有连历史元数据都没有的才回落占位符。
      const status = getReferenceStatus(references, value);
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
    [list, references, t]
  );

  // 存量数据可能是多选形态 [[nodeId, outputId]]：展示时取第一项即可，不回写文档。
  // 挂载时回写会让同一节点的多行动态输入用同一份渲染基线互相覆盖，
  // 打开工作流就触发提交风暴（见 editor/utils 的 getWorkflowReferenceItems）。
  const selectorVal = useMemo(
    () => getWorkflowReferenceItems(value)[0] as ReferenceItemValueType,
    [value]
  );
  const status = getReferenceStatus(references, selectorVal);
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
                    aria-label={invalidReason}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MyIcon name="common/warn" boxSize={3.5} />
                  </Box>
                </MyTooltip>
              )}
            </Flex>
          ) : (
            <Box fontSize={'sm'} color={'myGray.400'}>
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
  onOpenList
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
      const status = getReferenceStatus(references, item);
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
  }, [arrayVal, getSelectValue, references, t]);

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
                        nodeName || outputName || t('common:invalid_variable')
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
                      onClick={(e) => {
                        e.stopPropagation();
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
            <Box fontSize={'sm'} color={'myGray.400'}>
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
      />
    );
  }, [arrayVal, formatList, list, onOpenList, onSelect, placeholder, popDirection, t]);

  return ArraySelector;
};
export const ReferSelector = <T extends boolean>(props: SelectProps<T>) => {
  return props.isArray ? (
    <MultipleReferenceSelector {...(props as SelectProps<true>)} />
  ) : (
    <SingleReferenceSelector {...(props as SelectProps<false>)} />
  );
};
