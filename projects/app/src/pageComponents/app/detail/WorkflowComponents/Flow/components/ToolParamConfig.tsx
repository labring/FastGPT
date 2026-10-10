import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Box, Button } from '@chakra-ui/react';
import { useBoolean } from 'ahooks';
import { SystemToolSecretInputTypeMap } from '@fastgpt/global/core/app/tool/systemTool/constants';
import SecretInputModal, {
  type ToolParamsFormType
} from '@/pageComponents/app/tool/SecretInputModal';
import { useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowOverlayValue } from '@/web/core/workflow/editor/session/workflowSession';

const ToolConfig = ({ nodeId, inputs }: { nodeId?: string; inputs?: FlowNodeInputItemType[] }) => {
  const { t } = useTranslation();
  // nodeId 是可选 prop：hook 必须无条件调用，空 id 时 useNode / useField 返回 undefined。
  const nodeData = useNode(nodeId ?? '', (node) => node?.data);
  const inputFieldActions = useFieldActions({
    nodeId: nodeId ?? '',
    fieldKey: NodeInputKeyEnum.systemInputConfig,
    kind: 'input'
  });
  // 教程地址是画布视图数据（不进文档），由 NodeCard 拉到工具详情后写进 host overlay；
  // 选择器返回原始值，overlay 更新时 host 会 bump，这里随之刷新。
  const courseUrl = useWorkflowOverlayValue(nodeId)?.courseUrl as string | undefined;

  const inputConfig = useMemo(
    () => inputs?.find((item) => item.key === NodeInputKeyEnum.systemInputConfig),
    [inputs]
  );
  const inputList = inputConfig?.inputList;
  const [isOpen, { setTrue, setFalse }] = useBoolean(false);

  const activeButtonText = useMemo(() => {
    const val = inputConfig?.value as ToolParamsFormType;
    if (!val) {
      return t('workflow:tool_active_config');
    }

    return t('workflow:tool_active_config_type', {
      type: t(SystemToolSecretInputTypeMap[val.type]?.text as any)
    });
  }, [inputConfig?.value, t]);

  /** 提交密钥配置：只改这一个输入记录的值，走字段句柄而不是整节点 patch。 */
  const onSubmit = (data: ToolParamsFormType) => {
    if (
      !inputConfig ||
      !nodeData?.inputs.some((input) => input.key === NodeInputKeyEnum.systemInputConfig)
    )
      return;

    inputFieldActions.setValue(data);
    setFalse();
  };

  return nodeId && !!inputList && inputList.length > 0 ? (
    <>
      <Button
        variant={'whiteBase'}
        border={'base'}
        borderRadius={'md'}
        leftIcon={<Box w={'6px'} h={'6px'} bg={'primary.600'} borderRadius={'md'} />}
        onClick={setTrue}
      >
        {activeButtonText}
      </Button>
      {isOpen && (
        <SecretInputModal
          isFolder={nodeData?.isFolder}
          inputConfig={inputConfig}
          hasSystemSecret={nodeData?.hasSystemSecret}
          secretCost={nodeData?.systemKeyCost}
          courseUrl={courseUrl}
          readmeUrl={nodeData?.readmeUrl}
          parentId={nodeData?.pluginId}
          source={nodeData?.source}
          onClose={setFalse}
          onSubmit={onSubmit}
        />
      )}
    </>
  ) : null;
};

export default React.memo(ToolConfig);
