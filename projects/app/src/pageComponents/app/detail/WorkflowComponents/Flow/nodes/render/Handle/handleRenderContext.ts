import { createContext } from 'react';

/** full 节点由外层稳定 handle layer 托管时，业务内容不再重复挂载 Handle。 */
export const WorkflowHandleRenderContext = createContext(true);

/** 离屏测量时容器内容不读取已派生的子节点尺寸，避免尺寸循环并支持收缩。 */
export const WorkflowNodeMeasurementContext = createContext(false);
