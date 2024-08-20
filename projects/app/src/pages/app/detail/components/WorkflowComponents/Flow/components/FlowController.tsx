import React, { useEffect, useMemo } from 'react';
import { Background, ControlButton, MiniMap, Panel, useReactFlow } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import styles from './index.module.scss';

const controlTips = `【windows】
撤销  ctrl  z
恢复  ctrl  shift  z
放大  ctrl  +
缩小  ctrl  -

【mac】
撤销  ⌘  z  
恢复  ⌘  shift  z
放大  ⌘  +
缩小  ⌘  -

撤销上限50步，
恢复生效前提是撤销且没有新的操作
  - 可撤回范围：组件编辑、组件拖动、组件连线等
  - 不受影响：页面缩放滚动、保存的新版本、切换查看不同编辑记录`;

const FlowController = React.memo(function FlowController() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { undo, redo, canRedo, canUndo } = useContextSelector(WorkflowContext, (v) => v);
  const { t } = useTranslation();

  useEffect(() => {
    const keyDownHandler = (event: KeyboardEvent) => {
      if (event.key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        redo();
      } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
        undo();
      } else if ((event.key === '=' || event.key === '+') && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        zoomIn();
      } else if (event.key === '-' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        zoomOut();
      }
    };

    document.addEventListener('keydown', keyDownHandler);

    return () => {
      document.removeEventListener('keydown', keyDownHandler);
    };
  }, [undo, redo]);

  const buttonStyle = {
    border: 'none',
    borderRadius: '6px',
    padding: '7px'
  };

  const Render = useMemo(() => {
    return (
      <>
        <MiniMap
          style={{
            height: 106,
            width: 196,
            marginBottom: 86,
            borderRadius: '10px',
            boxShadow: '0px 0px 1px rgba(19, 51, 107, 0.10), 0px 4px 10px rgba(19, 51, 107, 0.10)'
          }}
          pannable
        />
        <Panel
          position={'bottom-right'}
          style={{
            display: 'flex',
            marginBottom: 24,
            padding: '10px 8px',
            background: 'white',
            borderRadius: '6px',
            overflow: 'hidden',
            alignItems: 'center',
            boxShadow:
              '0px 0px 1px 0px rgba(19, 51, 107, 0.20), 0px 12px 16px -4px rgba(19, 51, 107, 0.20)'
          }}
        >
          <MyTooltip label={controlTips}>
            <Flex gap={2}>
              <ControlButton
                onClick={() => undo()}
                style={buttonStyle}
                className={`${styles.customControlButton}`}
                disabled={!canUndo}
              >
                <MyIcon name={'core/workflow/undo'} />
              </ControlButton>
              <ControlButton
                onClick={() => redo()}
                style={buttonStyle}
                className={`${styles.customControlButton}`}
                disabled={!canRedo}
              >
                <MyIcon name={'core/workflow/redo'} />
              </ControlButton>
              <Box w="1px" h="20px" bg="gray.200" mx={1}></Box>
              <ControlButton
                onClick={() => zoomOut()}
                style={buttonStyle}
                className={`${styles.customControlButton}`}
              >
                <MyIcon name={'common/subtract'} />
              </ControlButton>
              <ControlButton
                onClick={() => zoomIn()}
                style={buttonStyle}
                className={`${styles.customControlButton}`}
              >
                <MyIcon name={'common/addLight'} />
              </ControlButton>
              <Box w="1px" h="20px" bg="gray.200" mx={1}></Box>
              <MyTooltip label={t('common:common.page_center')}>
                <ControlButton
                  onClick={() => fitView()}
                  style={buttonStyle}
                  className={`custom-workflow-fix_view ${styles.customControlButton}`}
                >
                  <MyIcon name={'core/modules/fixview'} />
                </ControlButton>
              </MyTooltip>
            </Flex>
          </MyTooltip>
        </Panel>
        <Background />
      </>
    );
  }, [fitView, canUndo, canRedo]);

  return Render;
});

export default FlowController;
