import React, { useMemo } from 'react';
import { type NodeProps, Position, useViewport } from 'reactflow';
import { Box } from '@chakra-ui/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MySourceHandle } from './render/Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { type UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import IOTitle from '../components/IOTitle';
import RenderOutput from './render/RenderOutput';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import DraggableInputList from '@/components/core/app/DraggableInputList';

const NodeUserSelect = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onDelEdge = useContextSelector(WorkflowActionsContext, (v) => v.onDelEdge);
  const { zoom } = useViewport();

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
                  sourceHandle: getHandleId(nodeId, 'source', key)
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
