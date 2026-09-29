import { createContext } from 'react';

/** full 节点由外层稳定 handle layer 托管时，业务内容不再重复挂载 Handle。 */
export const WorkflowHandleRenderContext = createContext(true);
