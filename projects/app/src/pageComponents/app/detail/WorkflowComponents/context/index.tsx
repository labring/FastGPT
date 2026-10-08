import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowSessionProvider } from '@/web/core/workflow/editor/session/workflowSession';
import WorkflowCanvasProvider from '../Flow/canvas/workflowCanvasContext';
import { WorkflowDebugProvider } from '../debug/workflowDebugSession';
import { useContextSelector } from 'use-context-selector';

/* 
  ReactFlowProvider
  └── WorkflowSessionProvider          // Runtime lifecycle, persistence and issue state
  └── WorkflowCanvasProvider       // renderer projection and interaction state
          └── WorkflowDebugProvider    // debug session renderer state

  UI 交互、选中态与弹窗 Context 属于 renderer 层（Flow/context/），挂载点在 renderer 组件树
  （页面 WorkflowEdit 与画布 Flow）。
*/

/**
 * 工作流编辑器装配：ReactFlow + host + renderer canvas state。
 */
export const ReactFlowCustomProvider = ({ children }: { children: React.ReactNode }) => {
  const appId = useContextSelector(AppContext, (value) => value.appId);
  const appDetailChatConfig = useContextSelector(AppContext, (value) => value.appDetail.chatConfig);
  const setAppDetail = useContextSelector(AppContext, (value) => value.setAppDetail);

  return (
    <ReactFlowProvider>
      <WorkflowSessionProvider
        appId={appId}
        appDetailChatConfig={appDetailChatConfig}
        onChatConfigChange={(chatConfig) => setAppDetail((detail) => ({ ...detail, chatConfig }))}
      >
        <WorkflowCanvasProvider>
          <WorkflowDebugProvider>{children}</WorkflowDebugProvider>
        </WorkflowCanvasProvider>
      </WorkflowSessionProvider>
    </ReactFlowProvider>
  );
};
