import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type DefaultEdgeOptions } from 'reactflow';

export const minZoom = 0.1;
export const maxZoom = 3;

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
