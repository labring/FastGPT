import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowInitContextProvider from './workflowInitContext';
import { WorkflowSnapshotProvider } from './workflowSnapshotContext';
import { WorkflowUtilsProvider } from './workflowUtilsContext';
import { WorkflowActionsProvider } from './workflowActionsContext';
import { WorkflowDebugProvider } from './workflowDebugContext';
import { WorkflowUIProvider } from './workflowUIContext';
import { WorkflowModalProvider } from './workflowModalContext';
import { WorkflowPersistenceProvider } from './workflowPersistenceContext';
import { WorkflowComputeProvider } from './workflowComputeContext';

/* 
  ReactFlowProvider
  └── WorkflowInitContextProvider          // Layer 1: 基础数据
      └── WorkflowBufferDataContext              // Layer 2: 节点边数据
          └── WorkflowSnapshotProvider     // Layer 3: 快照管理
              └── WorkflowActionsProvider  // Layer 4: 节点边操作
                └── WorkflowUtilsProvider    // Layer 5: 纯函数工具
                      └── WorkflowDebugProvider  // Layer 6: 调试功能
                          └── WorkflowUIProvider // Layer 7: UI 交互
                              └── WorkflowModalProvider    // Layer 8: 弹窗管理
                                └── WorkflowPersistenceProvider  // Layer 8: 持久化
                                      └── WorkflowComputeProvider // Layer 9: 复杂计算
*/
export const ReactFlowCustomProvider = ({
  templates,
  children
}: {
  templates: FlowNodeTemplateType[];
  children: React.ReactNode;
}) => {
  return (
    <ReactFlowProvider>
      <WorkflowInitContextProvider basicNodeTemplates={templates}>
        <WorkflowSnapshotProvider>
          <WorkflowActionsProvider>
            <WorkflowUtilsProvider>
              <WorkflowDebugProvider>
                <WorkflowUIProvider>
                  <WorkflowModalProvider>
                    <WorkflowPersistenceProvider>
                      <WorkflowComputeProvider>{children}</WorkflowComputeProvider>
                    </WorkflowPersistenceProvider>
                  </WorkflowModalProvider>
                </WorkflowUIProvider>
              </WorkflowDebugProvider>
            </WorkflowUtilsProvider>
          </WorkflowActionsProvider>
        </WorkflowSnapshotProvider>
      </WorkflowInitContextProvider>
    </ReactFlowProvider>
  );
};
