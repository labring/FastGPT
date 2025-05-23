import React, { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useLocalStorageState } from 'ahooks';
import { type SetState } from 'ahooks/lib/createUseStorageState';
import type { OnConnectStartParams } from 'reactflow';

type handleParamsType = OnConnectStartParams & {
  popoverPosition: { x: number; y: number };
  addNodePosition: { x: number; y: number };
};

type WorkflowEventContextType = {
  mouseInCanvas: boolean;
  reactFlowWrapper: React.RefObject<HTMLDivElement> | null;
  hoverNodeId?: string;
  setHoverNodeId: React.Dispatch<React.SetStateAction<string | undefined>>;
  hoverEdgeId?: string;
  setHoverEdgeId: React.Dispatch<React.SetStateAction<string | undefined>>;
  workflowControlMode?: 'drag' | 'select';
  setWorkflowControlMode: (value?: SetState<'drag' | 'select'> | undefined) => void;
  menu: {
    top: number;
    left: number;
  } | null;
  setMenu: (value: React.SetStateAction<{ top: number; left: number } | null>) => void;
  // version history
  showHistoryModal: boolean;
  setShowHistoryModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleParams: handleParamsType | null;
  setHandleParams: React.Dispatch<React.SetStateAction<handleParamsType | null>>;
};

export const WorkflowEventContext = createContext<WorkflowEventContextType>({
  mouseInCanvas: false,
  reactFlowWrapper: null,
  setHoverNodeId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  setHoverEdgeId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  workflowControlMode: 'drag',
  setWorkflowControlMode: function (value?: SetState<'drag' | 'select'> | undefined): void {
    throw new Error('Function not implemented.');
  },
  menu: null,
  setMenu: function (value: React.SetStateAction<{ top: number; left: number } | null>): void {
    throw new Error('Function not implemented.');
  },
  showHistoryModal: false,
  setShowHistoryModal: function (value: React.SetStateAction<boolean>): void {
    throw new Error('Function not implemented.');
  },
  handleParams: null,
  setHandleParams: function (value: React.SetStateAction<handleParamsType | null>): void {
    throw new Error('Function not implemented.');
  }
});

const WorkflowEventContextProvider = ({ children }: { children: ReactNode }) => {
  // Watch mouse in canvas
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [mouseInCanvas, setMouseInCanvas] = useState(false);
  const [handleParams, setHandleParams] = useState<handleParamsType | null>(null);

  useEffect(() => {
    const handleMouseInCanvas = (e: MouseEvent) => {
      setMouseInCanvas(true);
    };
    const handleMouseOutCanvas = (e: MouseEvent) => {
      setMouseInCanvas(false);
    };
    reactFlowWrapper?.current?.addEventListener('mouseenter', handleMouseInCanvas);
    reactFlowWrapper?.current?.addEventListener('mouseleave', handleMouseOutCanvas);
    return () => {
      reactFlowWrapper?.current?.removeEventListener('mouseenter', handleMouseInCanvas);
      reactFlowWrapper?.current?.removeEventListener('mouseleave', handleMouseOutCanvas);
    };
  }, [setMouseInCanvas]);

  // Watch hover node
  const [hoverNodeId, setHoverNodeId] = useState<string>();
  // Watch hover edge
  const [hoverEdgeId, setHoverEdgeId] = useState<string>();

  const [workflowControlMode, setWorkflowControlMode] = useLocalStorageState<'drag' | 'select'>(
    'workflow-control-mode',
    {
      defaultValue: 'drag',
      listenStorageChange: true
    }
  );

  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);

  /* Version histories */
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const contextValue = useMemo(
    () => ({
      mouseInCanvas,
      reactFlowWrapper,
      hoverNodeId,
      setHoverNodeId,
      hoverEdgeId,
      setHoverEdgeId,
      workflowControlMode,
      setWorkflowControlMode,
      menu,
      setMenu,
      showHistoryModal,
      setShowHistoryModal,
      handleParams,
      setHandleParams
    }),
    [
      mouseInCanvas,
      hoverNodeId,
      setHoverNodeId,
      hoverEdgeId,
      setHoverEdgeId,
      workflowControlMode,
      setWorkflowControlMode,
      menu,
      setMenu,
      showHistoryModal,
      setShowHistoryModal,
      handleParams,
      setHandleParams
    ]
  );
  return (
    <WorkflowEventContext.Provider value={contextValue}>{children}</WorkflowEventContext.Provider>
  );
};

export default WorkflowEventContextProvider;
