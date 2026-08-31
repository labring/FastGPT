import React from 'react';
import { Box, Flex, type BoxProps } from '@chakra-ui/react';
import type { RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '../type';
import { ChatBoxContentMaxWidth, type ChatTypeEnum } from '../constants';
import WelcomeBox from './WelcomeBox';
import VariableInputForm from './VariableInputForm';
import ChatRecordsList, { type ChatRecordsListProps } from './ChatRecordsList';
import QuickQuestionButton from '@/components/core/chat/QuickQuestionButton';
import { useContextSelector } from 'use-context-selector';
import { QuickReplyContext } from '../../context/quickReplyContext';
import { useChatInstanceActions } from '../../context/chatInstanceActionsContext';

type ScrollDataComponent = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  ScrollContainerRef?: RefObject<HTMLDivElement>;
} & BoxProps) => React.JSX.Element;

type AppChatMainProps = BoxProps & {
  ScrollData: ScrollDataComponent;
  ScrollContainerRef: RefObject<HTMLDivElement>;
  welcomeText?: string;
  welcomeQuestions?: string[];
  chatStarted: boolean;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatType: ChatTypeEnum;
  recordsListProps: ChatRecordsListProps;
  boxBodyProps?: BoxProps;
  EmptyState?: React.ReactNode;
  workflowBuilderStyle?: boolean;
};

/**
 * 渲染非 home 模式下的 ChatBox 主内容区。
 *
 * 这个组件直接承接原 `ChatBox/index.tsx` 中的 `AppChatRenderBox`：
 * - 外层仍使用 `ChatRecordContext` 提供的 `ScrollData`，保持历史分页和滚动容器行为。
 * - 内容区仍按原顺序渲染 welcome、变量表单和聊天记录列表。
 * - 底部输入区、workorder、home 欢迎页和发送/停止逻辑都不进入本组件，继续由 `index.tsx`
 *   编排，避免 UI 主区域拆分时改变输入或运行时行为。
 */
const AppChatMain = ({
  ScrollData,
  ScrollContainerRef,
  welcomeText,
  welcomeQuestions = [],
  chatStarted,
  chatForm,
  chatType,
  recordsListProps,
  maxW = ['100%', ChatBoxContentMaxWidth],
  boxBodyProps,
  EmptyState,
  workflowBuilderStyle = false
}: AppChatMainProps) => {
  const visibleWelcomeQuestions = welcomeQuestions.map((text) => text.trim()).filter(Boolean);
  const hasEmptyState = recordsListProps.records.length === 0 && !!EmptyState;
  // 复用快捷回复的发送通道：它不受 canSendPrompt 限制，开场白阶段的预设问题也能直接发送，
  // 由 sendPrompt 内部校验变量，行为与旧版 welcomeText 内嵌的 quick-replies 一致。
  const onQuickReplyClick = useContextSelector(QuickReplyContext, (v) => v.onQuickReplyClick);
  const { sendMessage } = useChatInstanceActions();

  return (
    <ScrollData
      ScrollContainerRef={ScrollContainerRef}
      flex={'1 0 0'}
      h={0}
      w={'100%'}
      overflow={'overlay'}
      overflowX={'hidden'}
      px={[4, 6]}
      pb={6}
      {...boxBodyProps}
    >
      <Box
        maxW={boxBodyProps?.maxW ?? maxW}
        w={'100%'}
        minW={0}
        h={'100%'}
        mx={boxBodyProps?.mx ?? boxBodyProps?.margin ?? 'auto'}
        display={'flex'}
        flexDirection={'column'}
      >
        {/* Workflow Builder 在所有断点都保持 Figma 的完整内容宽度；
            普通 ChatBox 继续沿用移动端额外收窄，避免改变既有聊天场景。 */}
        <Box
          className="chat-box-card"
          w={'100%'}
          maxW={workflowBuilderStyle ? '100%' : ['calc(100% - 25px)', ChatBoxContentMaxWidth]}
          mx={workflowBuilderStyle ? 0 : 'auto'}
        >
          {!!welcomeText && <WelcomeBox welcomeText={welcomeText} />}
          {visibleWelcomeQuestions.length > 0 && (
            <Flex w={'100%'} flexDirection={'column'} alignItems={'flex-start'} gap={2}>
              {visibleWelcomeQuestions.map((text, index) => (
                <QuickQuestionButton
                  key={`${index}-${text}`}
                  onClick={() => {
                    if (onQuickReplyClick) {
                      onQuickReplyClick(text);
                    } else {
                      sendMessage({ text });
                    }
                  }}
                >
                  {text}
                </QuickQuestionButton>
              ))}
            </Flex>
          )}
        </Box>

        <Box data-chat-variable-input>
          <VariableInputForm chatStarted={chatStarted} chatForm={chatForm} chatType={chatType} />
        </Box>

        {hasEmptyState ? (
          <Flex flex={1} alignItems="center" justifyContent="center" textAlign="center">
            {EmptyState}
          </Flex>
        ) : (
          <Box
            mt={visibleWelcomeQuestions.length > 0 && recordsListProps.records.length > 0 ? 4 : 0}
          >
            <ChatRecordsList {...recordsListProps} />
          </Box>
        )}
      </Box>
    </ScrollData>
  );
};

export default React.memo(AppChatMain);
