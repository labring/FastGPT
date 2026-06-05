import { Box, Flex } from '@chakra-ui/react';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import RenderAgentPlanAskInteractive from './RenderAgentPlanAskInteractive';
import RenderPaymentPauseInteractive from './RenderPaymentPauseInteractive';
import RenderPlan from './RenderPlan';
import RenderPlanStatus from './RenderPlanStatus';
import RenderProcessingCollapse from './RenderProcessingCollapse';
import RenderReasoningContent from './RenderReasoningContent';
import RenderSkill from './RenderSkill';
import RenderText from './RenderText';
import RenderTool from './RenderTool';
import RenderUserFormInteractive from './RenderUserFormInteractive';
import RenderUserSelectInteractive from './RenderUserSelectInteractive';

const AIResponseBox = ({
  chatItemDataId,
  value,
  responseData,
  isLastResponseValue,
  isLastChild,
  isChatting,
  onOpenCiteModal,
  wrapProcessing = true,
  showProcessing = true,
  showAnswer = true,
  showInteractive = true
}: {
  chatItemDataId: string;
  value: AIChatItemValueItemType;
  responseData?: ChatHistoryItemResType[];
  isLastResponseValue: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
  wrapProcessing?: boolean;
  showProcessing?: boolean;
  showAnswer?: boolean;
  showInteractive?: boolean;
}) => {
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const showSkillReferences = useContextSelector(ChatItemContext, (v) => v.showSkillReferences);
  const tools = value.tools || (value.tool ? [value.tool] : undefined);
  const disableStreamingInteraction = isChatting && isLastChild;
  const skills = value.skills;
  const reasoningContent = value.reasoning?.content || '';
  const textContent = value.text?.content || '';

  if (value.hideInUI) return null;

  const responseBlocks: React.ReactNode[] = [];
  const processingBlocks: React.ReactNode[] = [];

  if (showProcessing && reasoningContent && !value.hideReason) {
    processingBlocks.push(
      <RenderReasoningContent
        key="reasoning"
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue && !textContent && !tools}
        content={reasoningContent}
        isDisabled={disableStreamingInteraction}
      />
    );
  }

  if (showProcessing && tools && showRunningStatus) {
    processingBlocks.push(
      <Box key="tools">
        {tools.map((tool) => (
          <Box key={tool.id} _notLast={{ mb: 2 }}>
            <RenderTool showAnimation={isChatting} tool={tool} />
          </Box>
        ))}
      </Box>
    );
  }

  if (showProcessing && skills && showSkillReferences && showRunningStatus) {
    processingBlocks.push(
      <Box key="skills">
        {skills.map((skill) => (
          <Box key={skill.id} _notLast={{ mb: 2 }}>
            <RenderSkill skill={skill} />
          </Box>
        ))}
      </Box>
    );
  }

  if (showProcessing && 'plan' in value && value.plan) {
    processingBlocks.push(<RenderPlan key="plan" plan={value.plan} />);
  }

  if (showProcessing && 'planStatus' in value && value.planStatus?.status === 'generating') {
    processingBlocks.push(<RenderPlanStatus key="planStatus" planStatus={value.planStatus} />);
  }

  if (processingBlocks.length > 0) {
    if (wrapProcessing) {
      responseBlocks.push(
        <RenderProcessingCollapse
          key="processing"
          isProcessing={isChatting && isLastResponseValue && !textContent && !value.interactive}
        >
          {processingBlocks}
        </RenderProcessingCollapse>
      );
    } else {
      responseBlocks.push(...processingBlocks);
    }
  }

  if (showAnswer && value.text && textContent) {
    responseBlocks.push(
      <RenderText
        key="text"
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={textContent}
        onOpenCiteModal={onOpenCiteModal}
        isDisabled={disableStreamingInteraction}
      />
    );
  }

  if (showInteractive && 'interactive' in value && value.interactive) {
    const interactive = extractDeepestInteractive(value.interactive);
    if (interactive.type === 'userSelect') {
      responseBlocks.push(
        <RenderUserSelectInteractive key="interactive" interactive={interactive} />
      );
    }
    if (interactive.type === 'userInput') {
      responseBlocks.push(
        <RenderUserFormInteractive
          key="interactive"
          interactive={interactive}
          responseData={responseData}
          isLastChild={isLastChild}
        />
      );
    }
    if (interactive.type === 'agentPlanAskQuery') {
      responseBlocks.push(
        <RenderAgentPlanAskInteractive
          key="interactive"
          interactive={interactive}
          isLastChild={isLastChild}
        />
      );
    }
    if (interactive.type === 'paymentPause') {
      responseBlocks.push(
        <RenderPaymentPauseInteractive key="interactive" interactive={interactive} />
      );
    }
  }

  if (responseBlocks.length === 1) {
    return responseBlocks[0];
  }

  if (responseBlocks.length > 1) {
    return (
      <Flex flexDirection={'column'} gap={4}>
        {responseBlocks}
      </Flex>
    );
  }

  return null;
};

export default React.memo(AIResponseBox);
