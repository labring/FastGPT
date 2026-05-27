import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import Markdown from '@/components/Markdown';
import markdownStyles from '@/components/Markdown/index.module.scss';
import { CodeClassNameEnum } from '@/components/Markdown/utils';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import AIResponseBox from '../../../../components/AIResponseBox';

type AIChatBubbleContentProps = {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
};

const RenderQuestionGuide = ({ questionGuides }: { questionGuides: string[] }) => {
  return (
    <Markdown
      source={`\`\`\`${CodeClassNameEnum.questionguide}
${JSON.stringify(questionGuides)}`}
    />
  );
};

const AIChatBubbleContent = ({
  chatValue,
  responseData,
  dataId,
  isLastChild,
  isChatting,
  questionGuides,
  onOpenCiteModal
}: AIChatBubbleContentProps) => {
  const lastValue = chatValue[chatValue.length - 1];
  const lastHasText = !!lastValue?.text?.content?.trim();
  const lastHasReasoning = !!lastValue?.reasoning?.content?.trim();

  return (
    <Flex flexDirection={'column'}>
      {chatValue.map((value, i) => {
        const isLastResponse = isLastChild && i === chatValue.length - 1;
        const key = `${dataId}-ai-${i}`;

        return (
          <Box key={key} _notFirst={{ mt: 2 }}>
            <AIResponseBox
              chatItemDataId={dataId}
              value={value}
              responseData={responseData}
              isLastResponseValue={isLastResponse}
              isLastChild={isLastChild}
              isChatting={isChatting}
              onOpenCiteModal={onOpenCiteModal}
            />
          </Box>
        );
      })}

      {/* 生成中占位动画（含断线续传拉流期间最后一条非文本时的 shimmer） */}
      {isLastChild && !lastHasText && !lastHasReasoning && isChatting && (
        <Box className={markdownStyles.animation}></Box>
      )}

      {isLastChild && questionGuides.length > 0 && (
        <RenderQuestionGuide questionGuides={questionGuides} />
      )}
    </Flex>
  );
};

export default React.memo(AIChatBubbleContent);
