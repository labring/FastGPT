import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { Box } from '@chakra-ui/react';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import {
  getSelectedInputRenderType,
  workflowModelKeyMappings
} from '@fastgpt/global/core/workflow/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useContext, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useNodeWorkflowDocument } from '../../useWorkflowDocument';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';
import { useWorkflowEditorSessionId } from '@/web/core/workflow/editor/session/workflowSession';
import { getWorkflowEditorPath } from '@/web/core/workflow/editor/workflowEditorPath';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowNodeOffscreenMeasurementContext } from '../../Handle/handleRenderContext';
import { useContextSelector } from 'use-context-selector';

/**
 * 通用输入模板：文本/多行文本/数字/开关/单选多选/JSON/模型选择等渲染类型共用。
 *
 * 字段值写入走字段句柄（updateField）；只有「旧 aiModel 改名为 aiModelId」这类记录级变更
 * 才读文档当前 inputs、整份替换后走 updateNode。外层 data-workflow-history 标记必须保留：
 * 画布快捷键靠它在捕获阶段接管撤销重做，避免编辑器本地历史与工作流历史互相覆盖。
 */
const CommonInputForm = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const nodeActions = useNodeActions(nodeId);
  const value = useField(nodeId, item.key, 'input', (field) => field?.data.input?.value);
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const editorSessionId = useWorkflowEditorSessionId();
  // 变量列表只读本节点与其上游来源闭包：窄订阅让无关字段的提交不重算也不重渲染。
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
  const { feConfigs } = useSystemStore();

  const [, setDefaultModel] = useLocalStorageState<string>('workflow_default_llm_model', {
    defaultValue: ''
  });

  const selectedRenderType = getSelectedInputRenderType(item);
  const inputType = nodeInputTypeToInputType(
    selectedRenderType ? [selectedRenderType] : item.renderTypeList
  );
  const offscreenMeasurement = useContext(WorkflowNodeOffscreenMeasurementContext);

  const editorPath =
    inputType === InputTypeEnum.JSONEditor
      ? getWorkflowEditorPath({
          appId,
          sessionId: editorSessionId,
          editorKind: 'json',
          nodeId,
          fieldKey: item.key
        })
      : undefined;

  const editorVariables = useMemoEnhance(() => {
    if (!workflow || !graph) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      chatConfig: workflow.chatConfig,
      t,
      getSourceNodeIds: (sourceNodeId) => graph.getSourceNodeIds({ nodeId: sourceNodeId })
    });
  }, [nodeId, workflow, getNodeById, graph, t]);

  const externalVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const handleChange = useCallback(
    (value: any) => {
      // 添加长度验证（针对提示词字段）
      if (typeof value === 'string') {
        if (value.length > 1000000) {
          console.warn('Input value too long:', value.length);
          value = value.slice(0, 1000000);
        }
      }
      if (item.key === NodeInputKeyEnum.aiModel || item.key === NodeInputKeyEnum.aiModelId) {
        setDefaultModel(value);
      }

      const modelIdKey = workflowModelKeyMappings.find(
        ([legacyKey]) => legacyKey === item.key
      )?.[1];
      if (inputType === InputTypeEnum.selectLLMModel && modelIdKey) {
        // 记录级改名：以派发瞬间的 inputs 为基准整份替换，避免用 props 里的过滤后数组覆盖文档。
        nodeActions?.updateNode((current) => ({
          inputs: current.inputs.map((input) =>
            input.key === item.key ? { ...input, key: modelIdKey, value } : input
          )
        }));
        return;
      }

      fieldActions.setValue(value);
    },
    [fieldActions, inputType, item.key, nodeActions, setDefaultModel]
  );

  // 嵌套容器节点（loop/parallelRun/loopRun）里的 select 下拉向上展开，避免被子节点覆盖。
  const flowNodeType = workflow?.nodes.find((node) => node.nodeId === nodeId)?.flowNodeType;
  const menuPlacement = useMemo(() => {
    if (!flowNodeType) return undefined;
    return isNestedParentNodeType(flowNodeType) ? ('top-start' as const) : undefined;
  }, [flowNodeType]);

  const canOptimizePrompt = item.key === NodeInputKeyEnum.aiSystemPrompt;
  const OptimizerPopverComponent = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => {
      return (
        <OptimizerPopover
          iconButtonStyle={iconButtonStyle}
          defaultPrompt={value}
          onChangeText={(e) => {
            handleChange(e);
          }}
        />
      );
    },
    [value, handleChange]
  );

  // item.key 是字段名，直接展开会被 React 当成元素 key；field value 始终来自 Runtime。
  const { key: _itemKey, value: _itemValue, ...inputProps } = item;

  return (
    <WorkflowFieldScope nodeId={nodeId} fieldKey={item.key}>
      {/* 字段撤销由 Runtime 统一托管：打上标记后画布快捷键在捕获阶段接管，
          不再让编辑器本地历史（Lexical 按秒合并连续输入）与逐条记录的工作流历史互相覆盖。 */}
      <Box data-workflow-history="external">
        {offscreenMeasurement && inputType === InputTypeEnum.JSONEditor ? (
          <Box h={'100px'} />
        ) : (
          <InputRender
            inputType={inputType}
            value={value}
            onChange={handleChange}
            variables={[...(editorVariables || []), ...(externalVariables || [])]}
            variableLabels={editorVariables}
            path={editorPath}
            ExtensionPopover={canOptimizePrompt ? [OptimizerPopverComponent] : undefined}
            menuPlacement={menuPlacement}
            {...inputProps}
          />
        )}
      </Box>
    </WorkflowFieldScope>
  );
};

export default React.memo(CommonInputForm);
