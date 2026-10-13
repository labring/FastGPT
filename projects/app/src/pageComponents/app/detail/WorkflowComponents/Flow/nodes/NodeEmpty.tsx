import React from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const NodeEmpty = ({ data, selected }: CanvasNodeProps) => {
  return <NodeCard selected={selected} {...data}></NodeCard>;
};

export default React.memo(NodeEmpty);
