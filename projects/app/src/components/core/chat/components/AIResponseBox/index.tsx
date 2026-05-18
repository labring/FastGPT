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
  onOpenCiteModal
}: {
  chatItemDataId: string;
  value: AIChatItemValueItemType;
  responseData?: ChatHistoryItemResType[];
  isLastResponseValue: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
}) => {
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const showSkillReferences = useContextSelector(ChatItemContext, (v) => v.showSkillReferences);
  const tools = value.tools || (value.tool ? [value.tool] : undefined);
  const disableStreamingInteraction = isChatting && isLastChild;
  const skills = value.skills;

  if (value.hideInUI) return null;

  const responseBlocks: React.ReactNode[] = [];

  if ('reasoning' in value && value.reasoning) {
    responseBlocks.push(
      <RenderReasoningContent
        key="reasoning"
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue}
        content={value.reasoning.content}
        isDisabled={disableStreamingInteraction}
      />
    );
  }

  if ('text' in value && value.text) {
    responseBlocks.push(
      <RenderText
        key="text"
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={value.text.content}
        onOpenCiteModal={onOpenCiteModal}
        isDisabled={disableStreamingInteraction}
      />
    );
  }

  if (tools && showRunningStatus) {
    responseBlocks.push(
      <Box key="tools">
        {tools.map((tool) => (
          <Box key={tool.id} _notLast={{ mb: 2 }}>
            <RenderTool showAnimation={isChatting} tool={tool} />
          </Box>
        ))}
      </Box>
    );
  }

  if (skills && showSkillReferences && showRunningStatus) {
    responseBlocks.push(
      <Box key="skills">
        {skills.map((skill) => (
          <Box key={skill.id} _notLast={{ mb: 2 }}>
            <RenderSkill skill={skill} />
          </Box>
        ))}
      </Box>
    );
  }

  if ('interactive' in value && value.interactive) {
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

  if ('plan' in value && value.plan) {
    responseBlocks.push(<RenderPlan key="plan" plan={value.plan} />);
  }

  if ('planStatus' in value && value.planStatus?.status === 'generating') {
    responseBlocks.push(<RenderPlanStatus key="planStatus" planStatus={value.planStatus} />);
  }

  if (responseBlocks.length === 1) {
    return responseBlocks[0];
  }

  if (responseBlocks.length > 1) {
    return (
      <Flex flexDirection={'column'} gap={2}>
        {responseBlocks}
      </Flex>
    );
  }

  return null;
};

export default React.memo(AIResponseBox);
