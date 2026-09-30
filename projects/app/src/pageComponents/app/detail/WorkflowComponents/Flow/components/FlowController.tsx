import React, { useEffect, useMemo } from 'react';
import { Background, ControlButton, Panel, useReactFlow } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import styles from './index.module.scss';
import { useKeyPress } from 'ahooks';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { WorkflowUIContext } from '../context/workflowUIContext';
import {
  getWorkflowHistoryShortcut,
  isExternalHistoryTarget,
  isWorkflowShortcutInputtingTarget
} from '../hooks/keyboard';
import { WorkflowCanvasContext } from '../context/workflowCanvasContext';
import WorkflowMiniMap from './WorkflowMiniMap';

const buttonStyle = {
  border: 'none',
  borderRadius: '6px',
  padding: '7px'
};

const FlowController = React.memo(function FlowController() {
  const { zoomIn, zoomOut } = useReactFlow();
  const fitNodes = useContextSelector(WorkflowCanvasContext, (v) => v.fitNodes);
  const undo = useContextSelector(WorkflowHostContext, (v) => v.undo);
  const redo = useContextSelector(WorkflowHostContext, (v) => v.redo);
  const canUndo = useContextSelector(WorkflowHostContext, (v) => v.canUndo);
  const canRedo = useContextSelector(WorkflowHostContext, (v) => v.canRedo);
  // 按字段订阅：hover 会换 UI context 的值身份，控制器只读这五个字段，不该跟着刷新。
  const workflowControlMode = useContextSelector(WorkflowUIContext, (v) => v.workflowControlMode);
  const setWorkflowControlMode = useContextSelector(
    WorkflowUIContext,
    (v) => v.setWorkflowControlMode
  );
  const mouseInCanvas = useContextSelector(WorkflowUIContext, (v) => v.mouseInCanvas);
  const presentationMode = useContextSelector(WorkflowUIContext, (v) => v.presentationMode);
  const setPresentationMode = useContextSelector(WorkflowUIContext, (v) => v.setPresentationMode);
  const { t } = useTranslation();

  const isMac = !window ? false : window.navigator.userAgent.toLocaleLowerCase().includes('mac');

  /**
   * 撤销重做在捕获阶段接管：Lexical / Monaco 等编辑器会先在目标阶段跑自己的本地历史
   * （Lexical 还按秒合并连续输入），事件再冒泡到全局回调触发 Runtime 撤销，
   * 一次按键走两套历史，表现为撤销跳步并清空 redo 栈。
   *
   * 规则：Runtime 托管字段（data-workflow-history="external"）不论鼠标在哪都走画布历史；
   * 其余沿用旧边界——鼠标在画布内才接管，且自带撤销栈的输入控件优先处理自己的历史。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getWorkflowHistoryShortcut(event);
      if (!direction) return;

      if (!isExternalHistoryTarget(event.target)) {
        if (!mouseInCanvas) return;
        if (isWorkflowShortcutInputtingTarget(event.target)) return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (direction === 'redo') redo();
      else undo();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [mouseInCanvas, redo, undo]);

  useKeyPress(['ctrl.add', 'meta.add', 'ctrl.equalsign', 'meta.equalsign'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mouseInCanvas) return;
    zoomIn();
  });
  useKeyPress(['ctrl.dash', 'meta.dash'], (e) => {
    e.preventDefault();
    if (!mouseInCanvas) return;
    zoomOut();
  });

  useKeyPress(['shift.space'], (e) => {
    e.preventDefault();
    if (!mouseInCanvas) return;
    setPresentationMode((v) => !v);
  });

  const Render = useMemo(() => {
    return (
      <>
        <WorkflowMiniMap
          ariaLabel={t('common:page_center')}
          style={{
            height: 92,
            width: 150,
            marginBottom: 62,
            borderRadius: '10px',
            boxShadow: '0px 0px 1px rgba(19, 51, 107, 0.10), 0px 4px 10px rgba(19, 51, 107, 0.10)'
          }}
        />
        <Panel
          position={'bottom-right'}
          style={{
            display: 'flex',
            marginBottom: 16,
            padding: '5px 8px',
            background: 'white',
            borderRadius: '6px',
            overflow: 'hidden',
            alignItems: 'center',
            gap: '2px',
            boxShadow:
              '0px 0px 1px 0px rgba(19, 51, 107, 0.20), 0px 12px 16px -4px rgba(19, 51, 107, 0.20)'
          }}
        >
          {/* Control Mode */}
          <MyTooltip
            label={
              workflowControlMode === 'select'
                ? t('workflow:pan_priority')
                : t('workflow:mouse_priority')
            }
          >
            <ControlButton
              onClick={() => {
                setWorkflowControlMode(workflowControlMode === 'select' ? 'drag' : 'select');
              }}
              style={{
                ...buttonStyle
              }}
              className={`${styles.customControlButton}`}
            >
              <MyIcon
                name={
                  workflowControlMode === 'select'
                    ? 'core/workflow/touchTable'
                    : 'core/workflow/mouse'
                }
              />
            </ControlButton>
          </MyTooltip>

          <Box w="1px" h="20px" bg="gray.200" mx={1.5}></Box>

          {/* undo */}
          <MyTooltip label={isMac ? t('common:undo_tip_mac') : t('common:undo_tip')}>
            <ControlButton
              onClick={undo}
              style={buttonStyle}
              className={`${styles.customControlButton}`}
              disabled={!canUndo}
            >
              <MyIcon name={'core/workflow/undo'} />
            </ControlButton>
          </MyTooltip>

          {/* redo */}
          <MyTooltip label={isMac ? t('common:redo_tip_mac') : t('common:redo_tip')}>
            <ControlButton
              onClick={redo}
              style={buttonStyle}
              className={`${styles.customControlButton}`}
              disabled={!canRedo}
            >
              <MyIcon name={'core/workflow/redo'} />
            </ControlButton>
          </MyTooltip>

          <Box w="1px" h="20px" bg="gray.200" mx={1.5}></Box>

          {/* presentation */}
          <MyTooltip
            label={
              presentationMode ? t('workflow:Edit_mode_tip') : t('workflow:Presentation_mode_tip')
            }
          >
            <ControlButton
              onClick={() => {
                setPresentationMode(!presentationMode);
              }}
              style={{
                ...buttonStyle,
                ...(presentationMode ? { backgroundColor: 'rgba(17, 24, 36, 0.05)' } : {})
              }}
              className={`${styles.customControlButton}`}
            >
              <MyIcon name={'core/workflow/present'} fill="none" />
            </ControlButton>
          </MyTooltip>

          <Box w="1px" h="20px" bg="gray.200" mx={1.5}></Box>

          {/* fit view */}
          <MyTooltip label={t('common:page_center')}>
            <ControlButton
              onClick={() => {
                fitNodes(undefined, { padding: 0.3 });
              }}
              style={buttonStyle}
              className={`custom-workflow-fix_view ${styles.customControlButton}`}
            >
              <MyIcon name={'core/modules/fitView'} />
            </ControlButton>
          </MyTooltip>
        </Panel>
        <Background color="#A4A4A4" gap={60} size={3} />
      </>
    );
  }, [
    workflowControlMode,
    t,
    isMac,
    undo,
    canUndo,
    redo,
    canRedo,
    presentationMode,
    setWorkflowControlMode,
    setPresentationMode,
    fitNodes
  ]);

  return Render;
});

export default FlowController;
