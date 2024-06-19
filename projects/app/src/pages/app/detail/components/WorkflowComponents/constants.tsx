import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type';
import React from 'react';
import { DefaultEdgeOptions } from 'reactflow';

export const connectionLineStyle: React.CSSProperties = {
  strokeWidth: 2,
  stroke: '#487FFF'
};

export const defaultEdgeOptions: DefaultEdgeOptions = {
  zIndex: 0
};

export const defaultRunningStatus: FlowNodeItemType['debugResult'] = {
  status: 'running',
  message: '',
  showResult: false
};
export const defaultSkippedStatus: FlowNodeItemType['debugResult'] = {
  status: 'skipped',
  message: '',
  showResult: false
};

export default function Dom() {
  return <></>;
}
