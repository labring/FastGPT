import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useLocalStorageState } from 'ahooks';
import { SetState } from 'ahooks/lib/createUseStorageState';

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
  }
});

const WorkflowEventContextProvider = ({ children }: { children: ReactNode }) => {
  // Watch mouse in canvas
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [mouseInCanvas, setMouseInCanvas] = useState(false);
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
  }, [reactFlowWrapper?.current, setMouseInCanvas]);

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
      setShowHistoryModal
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
      setShowHistoryModal
    ]
  );
  return (
    <WorkflowEventContext.Provider value={contextValue}>{children}</WorkflowEventContext.Provider>
  );
};

export default WorkflowEventContextProvider;
