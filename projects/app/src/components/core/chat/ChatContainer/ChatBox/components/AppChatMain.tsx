import React from 'react';
import { Box, Flex, type BoxProps } from '@chakra-ui/react';
import type { RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '../type';
import type { ChatTypeEnum } from '../constants';
import WelcomeBox from './WelcomeBox';
import VariableInputForm from './VariableInputForm';
import ChatRecordsList, { type ChatRecordsListProps } from './ChatRecordsList';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { useContextSelector } from 'use-context-selector';
import { QuickReplyContext } from '../../context/quickReplyContext';

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
  maxW = ['100%', '92%'],
  boxBodyProps,
  EmptyState
}: AppChatMainProps) => {
  const visibleWelcomeQuestions = React.useMemo(
    () => welcomeQuestions.map((text) => text.trim()).filter(Boolean),
    [welcomeQuestions]
  );
  // 复用快捷回复的发送通道：它不受 canSendPrompt 限制，开场白阶段的预设问题也能直接发送，
  // 由 sendPrompt 内部校验变量，行为与旧版 welcomeText 内嵌的 quick-replies 一致。
  const onQuickReplyClick = useContextSelector(QuickReplyContext, (v) => v.onQuickReplyClick);

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
        {!!welcomeText && <WelcomeBox welcomeText={welcomeText} />}
        {visibleWelcomeQuestions.length > 0 && (
          <Flex
            mt={3}
            mb={4}
            flexDirection={'column'}
            alignItems={'flex-start'}
            gap={'8px'}
            w={'100%'}
          >
            {visibleWelcomeQuestions.map((text) => (
              <Flex
                key={text}
                alignItems={'flex-start'}
                gap={2}
                maxW={'100%'}
                minW={0}
                px={['16px', '8px']}
                py={['8px', '4px']}
                borderRadius={'8px'}
                border={'0.5px solid'}
                borderColor={'myGray.250'}
                bg={'transparent'}
                color={'myGray.600'}
                fontSize={'14px'}
                lineHeight={'20px'}
                fontWeight={500}
                cursor={'pointer'}
                _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
                onClick={() => {
                  if (onQuickReplyClick) {
                    onQuickReplyClick(text);
                  } else {
                    eventBus.emit(EventNameEnum.sendQuestion, { text });
                  }
                }}
              >
                <Box minW={0} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                  {text}
                </Box>
              </Flex>
            ))}
          </Flex>
        )}

        <Box id="variable-input">
          <VariableInputForm chatStarted={chatStarted} chatForm={chatForm} chatType={chatType} />
        </Box>

        <Box mt={visibleWelcomeQuestions.length > 0 && recordsListProps.records.length > 0 ? 4 : 0}>
          {recordsListProps.records.length === 0 && EmptyState ? (
            EmptyState
          ) : (
            <ChatRecordsList {...recordsListProps} />
          )}
        </Box>
      </Box>
    </ScrollData>
  );
};

export default React.memo(AppChatMain);
