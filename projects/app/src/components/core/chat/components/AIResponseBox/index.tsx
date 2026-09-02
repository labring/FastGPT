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
import RenderAgentAskInteractive from './RenderAgentAskInteractive';
import RenderPaymentPauseInteractive from './RenderPaymentPauseInteractive';
import RenderPlan from './RenderPlan';
import RenderPlanStatus from './RenderPlanStatus';
import RenderProcessingCollapse from './RenderProcessingCollapse';
import type { ProcessingPreviewTarget } from './RenderProcessingPreview';
import RenderReasoningContent from './RenderReasoningContent';
import RenderSkill from './RenderSkill';
import RenderText from './RenderText';
import RenderTool from './RenderTool';
import RenderUserFormInteractive from './RenderUserFormInteractive';
import RenderUserSelectInteractive from './RenderUserSelectInteractive';
import { adaptLegacyAgentPlanAskToReadonlyAgentAsk } from './utils';

const AIResponseBox = ({
  chatItemDataId,
  value,
  responseData,
  isLastResponseValue,
  isLastChild,
  isChatting,
  onOpenCiteModal,
  allowedCitationIds,
  wrapProcessing = true,
  showProcessing = true,
  showFoldableProcessing: showFoldableProcessingProp = true,
  showStandaloneProcessing: showStandaloneProcessingProp = true,
  showAnswer = true,
  showInteractive = true,
  defaultExpandProcessing = true,
  defaultExpandedProcessingTarget
}: {
  chatItemDataId: string;
  value: AIChatItemValueItemType;
  responseData?: ChatHistoryItemResType[];
  isLastResponseValue: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
  allowedCitationIds?: Set<string>;
  wrapProcessing?: boolean;
  showProcessing?: boolean;
  showFoldableProcessing?: boolean;
  showStandaloneProcessing?: boolean;
  showAnswer?: boolean;
  showInteractive?: boolean;
  defaultExpandProcessing?: boolean;
  defaultExpandedProcessingTarget?: ProcessingPreviewTarget;
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
  const foldableProcessingBlocks: React.ReactNode[] = [];
  const standaloneProcessingBlocks: React.ReactNode[] = [];

  const showFoldableProcessing = showProcessing && showFoldableProcessingProp;
  const showStandaloneProcessing = showProcessing && showStandaloneProcessingProp;

  if (showFoldableProcessing && reasoningContent && !value.hideReason) {
    foldableProcessingBlocks.push(
      <RenderReasoningContent
        key="reasoning"
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue && !textContent && !tools}
        content={reasoningContent}
        isDisabled={disableStreamingInteraction}
        defaultExpanded={
          defaultExpandedProcessingTarget?.type === 'reasoning' ||
          (defaultExpandProcessing && isLastResponseValue && !textContent && !tools)
        }
      />
    );
  }

  if (showFoldableProcessing && tools && showRunningStatus) {
    foldableProcessingBlocks.push(
      <Box key="tools">
        {tools.map((tool) => (
          <Box key={tool.id} _notLast={{ mb: 2 }}>
            <RenderTool
              showAnimation={isChatting}
              tool={tool}
              defaultExpanded={
                defaultExpandedProcessingTarget?.type === 'tool' &&
                defaultExpandedProcessingTarget.toolId === tool.id
              }
            />
          </Box>
        ))}
      </Box>
    );
  }

  if (showStandaloneProcessing && skills && showSkillReferences && showRunningStatus) {
    standaloneProcessingBlocks.push(
      <Box key="skills">
        {skills.map((skill) => (
          <Box key={skill.id} _notLast={{ mb: 2 }}>
            <RenderSkill skill={skill} />
          </Box>
        ))}
      </Box>
    );
  }

  if (showStandaloneProcessing && 'plan' in value && value.plan) {
    standaloneProcessingBlocks.push(<RenderPlan key="plan" plan={value.plan} />);
  }

  if (
    showStandaloneProcessing &&
    'planStatus' in value &&
    value.planStatus?.status === 'generating'
  ) {
    standaloneProcessingBlocks.push(
      <RenderPlanStatus key="planStatus" planStatus={value.planStatus} />
    );
  }

  if (foldableProcessingBlocks.length > 0) {
    if (wrapProcessing) {
      responseBlocks.push(
        <RenderProcessingCollapse
          key="processing"
          isProcessing={isChatting && isLastResponseValue && !textContent && !value.interactive}
        >
          {foldableProcessingBlocks}
        </RenderProcessingCollapse>
      );
    } else {
      responseBlocks.push(...foldableProcessingBlocks);
    }
  }

  responseBlocks.push(...standaloneProcessingBlocks);

  if (showAnswer && value.text && textContent) {
    responseBlocks.push(
      <RenderText
        key="text"
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={textContent}
        onOpenCiteModal={onOpenCiteModal}
        allowedCitationIds={allowedCitationIds}
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
    if (interactive.type === 'agentAsk') {
      responseBlocks.push(
        <RenderAgentAskInteractive
          key="interactive"
          interactive={interactive}
          submitted={interactive.params.submitted || !isLastChild}
        />
      );
    }
    if (interactive.type === 'agentPlanAskQuery') {
      // 旧 ask_user 仅适配展示，不能恢复为当前轮可提交的交互。
      responseBlocks.push(
        <RenderAgentAskInteractive
          key="interactive"
          interactive={adaptLegacyAgentPlanAskToReadonlyAgentAsk(interactive)}
          submitted={true}
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
      <Flex flexDirection={'column'} gap={2}>
        {responseBlocks}
      </Flex>
    );
  }

  return null;
};

export default React.memo(AIResponseBox);
