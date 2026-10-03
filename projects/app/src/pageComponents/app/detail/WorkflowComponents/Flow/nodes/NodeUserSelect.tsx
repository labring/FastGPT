import React, { useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useViewport } from 'reactflow';
import { Box } from '@chakra-ui/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useTranslation } from 'next-i18next';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MySourceHandle } from './render/Handle';
import { getHandleId, getSelectedInputRenderType } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { type UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import IOTitle from '../components/IOTitle';
import RenderOutput from './render/RenderOutput';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import DraggableInputList from '@/components/core/app/DraggableInputList';

const referenceSourceHandleKey = 'ref_default';
const getOptionSourceHandleId = (nodeId: string, key: string) => getHandleId(nodeId, 'source', key);

const defaultManualOptions: UserSelectOptionItemType[] = [
  { value: 'Confirm', key: 'option1' },
  { value: 'Cancel', key: 'option2' }
];
const getDefaultManualOptions = () => defaultManualOptions.map((option) => ({ ...option }));

const NodeUserSelect = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onDelEdge = useContextSelector(WorkflowActionsContext, (v) => v.onDelEdge);
  const { zoom } = useViewport();
  const previousRenderTypeRef = useRef<FlowNodeInputTypeEnum>();
  const lastManualOptionsRef = useRef<UserSelectOptionItemType[]>(defaultManualOptions);

  const userSelectInput = useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.userSelectOptions),
    [inputs]
  );
  const currentRenderType = userSelectInput && getSelectedInputRenderType(userSelectInput);

  useEffect(() => {
    if (!userSelectInput || !currentRenderType) return;

    const previousRenderType = previousRenderTypeRef.current;
    if (
      currentRenderType === FlowNodeInputTypeEnum.custom &&
      previousRenderType !== FlowNodeInputTypeEnum.reference &&
      Array.isArray(userSelectInput.value)
    ) {
      lastManualOptionsRef.current = userSelectInput.value as UserSelectOptionItemType[];
    }
    previousRenderTypeRef.current = currentRenderType;
    if (!previousRenderType || previousRenderType === currentRenderType) return;

    if (previousRenderType === FlowNodeInputTypeEnum.custom) {
      lastManualOptionsRef.current.forEach((option) => {
        onDelEdge({
          nodeId,
          sourceHandle: getOptionSourceHandleId(nodeId, option.key)
        });
      });
      return;
    }

    const manualOptions = getDefaultManualOptions();
    onDelEdge({
      nodeId,
      sourceHandle: getOptionSourceHandleId(nodeId, referenceSourceHandleKey)
    });
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.userSelectOptions,
      value: { ...userSelectInput, value: manualOptions }
    });
  }, [currentRenderType, nodeId, onChangeNode, onDelEdge, userSelectInput]);

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.userSelectOptions]: (v: FlowNodeInputItemType) => {
        const { key: optionKey, value, ...props } = v;
        const options = value as UserSelectOptionItemType[];

        return (
          <Box>
            <DraggableInputList<UserSelectOptionItemType>
              items={options}
              zoom={zoom}
              addText={t('common:core.module.Add_option')}
              onDragEnd={(list) => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: list
                  }
                });
              }}
              onChange={(key, value) => {
                const newVal = options.map((val) =>
                  val.key === key
                    ? {
                        ...val,
                        value
                      }
                    : val
                );
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: newVal
                  }
                });
              }}
              onAdd={() => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: options.concat({ value: '', key: getNanoid() })
                  }
                });
              }}
              onDelete={(key) => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: options.filter((input) => input.key !== key)
                  }
                });
                onDelEdge({
                  nodeId,
                  sourceHandle: getOptionSourceHandleId(nodeId, key)
                });
              }}
              renderRight={(item, snapshot) =>
                !snapshot.isDragging && (
                  <MySourceHandle
                    nodeId={nodeId}
                    handleId={getHandleId(nodeId, 'source', item.key)}
                    position={Position.Right}
                    // Handler 渲染在 DraggableInputList 的 flex 输入容器内；右侧删除按钮和 gap
                    // 使该容器比节点内容区域缩进 24px，需要补偿后才能与节点右边缘对齐。
                    translate={[58, 0]}
                  />
                )
              }
            />
          </Box>
        );
      }
    }),
    [nodeId, onChangeNode, onDelEdge, t, zoom]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeUserSelect);
