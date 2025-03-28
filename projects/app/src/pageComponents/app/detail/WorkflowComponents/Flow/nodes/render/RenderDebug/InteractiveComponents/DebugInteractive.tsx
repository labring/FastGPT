import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { initWorkflowEdgeStatus } from '@fastgpt/global/core/workflow/runtime/utils';
import type {
  UserInputInteractive,
  UserSelectInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  type SelectOptionType,
  type FormItemType,
  FormInputComponent,
  SelectOptionsComponent
} from '@/components/core/chat/components/Interactive/InteractiveComponents';
const useInteractiveDebug = (
  interactive: UserSelectInteractive | UserInputInteractive,
  nodeId?: string
) => {
  const { onStartNodeDebug, workflowDebugData } = useContextSelector(WorkflowContext, (v) => ({
    onStartNodeDebug: v.onStartNodeDebug,
    workflowDebugData: v.workflowDebugData
  }));
  const interactiveData = useMemo(() => {
    return {
      ...interactive,
      memoryEdges: interactive?.memoryEdges || [],
      entryNodeIds: interactive?.entryNodeIds || [],
      nodeOutputs: interactive?.nodeOutputs || []
    };
  }, [interactive]);
  const createMockHistory = useCallback((): ChatItemType[] => {
    return [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            type: ChatItemValueTypeEnum.interactive,
            interactive: interactiveData
          }
        ]
      }
    ];
  }, [interactiveData]);
  const startDebug = useCallback(
    (userContent: string, nodeUpdater: (node: any) => any) => {
      if (!nodeId || !workflowDebugData) return;
      const updatedQuery: UserChatItemValueItemType[] = [
        ...(workflowDebugData.query || []),
        {
          type: ChatItemValueTypeEnum.text,
          text: { content: userContent }
        }
      ];
      const mockHistory = createMockHistory();
      const updatedRuntimeEdges = initWorkflowEdgeStatus(
        workflowDebugData.runtimeEdges,
        mockHistory
      );
      const updatedRuntimeNodes = workflowDebugData.runtimeNodes.map((node) =>
        node.nodeId === nodeId ? nodeUpdater(node) : node
      );
      onStartNodeDebug({
        entryNodeId: nodeId,
        runtimeNodes: updatedRuntimeNodes,
        runtimeEdges: updatedRuntimeEdges,
        variables: workflowDebugData.variables,
        query: updatedQuery,
        history: mockHistory
      });
    },
    [nodeId, workflowDebugData, onStartNodeDebug, createMockHistory]
  );
  return { workflowDebugData, interactiveData, startDebug };
};
export const RenderUserSelectInteractive = React.memo(function RenderInteractive({
  interactive,
  nodeId
}: {
  interactive: UserSelectInteractive;
  nodeId?: string;
}) {
  const { startDebug } = useInteractiveDebug(interactive, nodeId);
  const handleSelectAndNext = useCallback(
    (value: string) => {
      startDebug(value || '', (node) => ({
        ...node,
        inputs: node.inputs.map((input: { key: string }) => {
          if (input.key === 'userSelect' || input.key === 'selectedOption') {
            return { ...input, value };
          }
          return input;
        }),
        userSelectedVal: value
      }));
    },
    [startDebug]
  );
  return (
    <Box px={4} py={3}>
      <SelectOptionsComponent
        options={(interactive.params.userSelectOptions || []) as SelectOptionType[]}
        description={interactive.params.description}
        selectedValue={interactive.params.userSelectedVal}
        onSelectOption={handleSelectAndNext}
        isDisabled={interactive.params.userSelectedVal !== undefined}
      />
    </Box>
  );
});
export const RenderUserFormInteractive = React.memo(function RenderFormInput({
  interactive,
  nodeId
}: {
  interactive: UserInputInteractive;
  nodeId?: string;
}) {
  const { t } = useTranslation();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { startDebug } = useInteractiveDebug(interactive, nodeId);
  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
      acc[item.label] = !!item.value ? item.value : item.defaultValue;
      return acc;
    }, {});
  }, [interactive.params.inputForm]);
  const handleFormSubmit = useCallback(
    (formData: Record<string, any>) => {
      if (!nodeId) return;
      setIsSubmitted(true);
      startDebug(JSON.stringify(formData), (node) => ({
        ...node,
        inputs: node.inputs.map((input: { key: string }) => {
          const formField = interactive.params.inputForm?.find(
            (field) => field.label === input.key || field.key === input.key
          );
          if (formField) {
            return { ...input, value: formData[formField.label] };
          }
          return input;
        }),
        formSubmitted: true
      }));
    },
    [nodeId, startDebug, interactive.params.inputForm]
  );
  useEffect(() => {
    if (interactive.params.submitted) {
      setIsSubmitted(true);
    }
  }, [interactive.params.submitted]);
  return (
    <Box px={4} py={4} bg="white" borderRadius="md">
      <FormInputComponent
        inputForm={(interactive.params.inputForm || []) as FormItemType[]}
        description={interactive.params.description}
        onSubmit={handleFormSubmit}
        isDisabled={isSubmitted || interactive.params.submitted}
        defaultValues={defaultValues}
        submitButtonText="common:Submit"
        submitButtonIcon="core/workflow/debugNext"
      />
    </Box>
  );
});
