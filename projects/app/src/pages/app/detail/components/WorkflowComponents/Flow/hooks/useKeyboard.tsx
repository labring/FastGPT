import { useCallback, useEffect, useState } from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { Node } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '../../context';
import { useWorkflowUtils } from './useUtils';

export const useKeyboard = () => {
  const { t } = useTranslation();
  const { setNodes, onSaveWorkflow } = useContextSelector(WorkflowContext, (v) => v);
  const { copyData } = useCopyData();
  const { computedNewNodeName } = useWorkflowUtils();

  const [isDowningCtrl, setIsDowningCtrl] = useState(false);

  const hasInputtingElement = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      const className = activeElement.className.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return true;
      if (className.includes('prompteditor')) return true;
    }

    return false;
  }, []);

  const onCopy = useCallback(async () => {
    if (hasInputtingElement()) return;
    const { nodes } = await getWorkflowStore();

    const selectedNodes = nodes.filter(
      (node) => node.selected && !node.data?.isError && node.data?.unique !== true
    );
    if (selectedNodes.length === 0) return;
    copyData(JSON.stringify(selectedNodes), t('core.workflow.Copy node'));
  }, [copyData, hasInputtingElement, t]);

  const onParse = useCallback(async () => {
    if (hasInputtingElement()) return;
    const copyResult = await navigator.clipboard.readText();
    try {
      const parseData = JSON.parse(copyResult) as Node<FlowNodeItemType, string | undefined>[];
      // check is array
      if (!Array.isArray(parseData)) return;
      // filter workflow data
      const newNodes = parseData
        .filter((item) => !!item.type && item.data?.unique !== true)
        .map((item) => {
          const nodeId = getNanoid();
          return {
            // reset id
            ...item,
            id: nodeId,
            data: {
              ...item.data,
              name: computedNewNodeName({
                templateName: item.data?.name || '',
                flowNodeType: item.data?.flowNodeType || '',
                pluginId: item.data?.pluginId
              }),
              nodeId
            },
            position: {
              x: item.position.x + 100,
              y: item.position.y + 100
            }
          };
        });

      setNodes((prev) =>
        prev
          .map((node) => ({
            ...node,
            selected: false
          }))
          //@ts-ignore
          .concat(newNodes)
      );
    } catch (error) {}
  }, [computedNewNodeName, hasInputtingElement, setNodes]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        setIsDowningCtrl(true);

        switch (event.key) {
          case 'c':
            onCopy();
            break;
          case 'v':
            onParse();
            break;
          case 's':
            event.preventDefault();

            onSaveWorkflow();
            break;
          default:
            break;
        }
      }
    },
    [onCopy, onParse, onSaveWorkflow]
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    setIsDowningCtrl(false);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyUp]);

  return {
    isDowningCtrl
  };
};

export default function Dom() {
  return <></>;
}
