import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Box, Button } from '@chakra-ui/react';
import { useBoolean } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { SystemToolInputTypeMap } from '@fastgpt/global/core/app/systemTool/constants';
import SecretInputModal, {
  type ToolParamsFormType
} from '@/pageComponents/app/plugin/SecretInputModal';

const ToolConfig = ({ nodeId, inputs }: { nodeId?: string; inputs?: FlowNodeInputItemType[] }) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const node = useContextSelector(WorkflowContext, (v) =>
    v.nodeList.find((item) => item.nodeId === nodeId)
  );

  const inputConfig = inputs?.find((item) => item.key === NodeInputKeyEnum.systemInputConfig);
  const inputList = inputConfig?.inputList;
  const [isOpen, { setTrue, setFalse }] = useBoolean(false);

  const activeButtonText = useMemo(() => {
    const val = inputConfig?.value as ToolParamsFormType;
    if (!val) {
      return t('workflow:tool_active_config');
    }

    return t('workflow:tool_active_config_type', {
      type: t(SystemToolInputTypeMap[val.type]?.text as any)
    });
  }, [inputConfig?.value, t]);

  const onSubmit = (data: ToolParamsFormType) => {
    if (!inputConfig) return;

    onChangeNode({
      nodeId: nodeId as string,
      type: 'updateInput',
      key: inputConfig.key,
      value: {
        ...inputConfig,
        value: data
      }
    });
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
          inputConfig={inputConfig}
          hasSystemSecret={node?.hasSystemSecret}
          secretCost={node?.currentCost}
          courseUrl={node?.courseUrl}
          onClose={setFalse}
          onSubmit={onSubmit}
        />
      )}
    </>
  ) : null;
};

export default React.memo(ToolConfig);
