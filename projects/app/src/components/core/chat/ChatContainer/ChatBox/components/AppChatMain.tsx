import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import type { RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '../type';
import type { ChatTypeEnum } from '../constants';
import WelcomeBox from './WelcomeBox';
import VariableInputForm from './VariableInputForm';
import ChatRecordsList, { type ChatRecordsListProps } from './ChatRecordsList';

type ScrollDataComponent = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  ScrollContainerRef?: RefObject<HTMLDivElement>;
} & BoxProps) => React.JSX.Element;

type AppChatMainProps = {
  ScrollData: ScrollDataComponent;
  ScrollContainerRef: RefObject<HTMLDivElement>;
  welcomeText?: string;
  chatStarted: boolean;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatType: ChatTypeEnum;
  recordsListProps: ChatRecordsListProps;
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
  chatStarted,
  chatForm,
  chatType,
  recordsListProps
}: AppChatMainProps) => {
  return (
    <ScrollData
      ScrollContainerRef={ScrollContainerRef}
      flex={'1 0 0'}
      h={0}
      w={'100%'}
      overflow={'overlay'}
      px={[4, 0]}
      pb={6}
    >
      <Box maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
        {!!welcomeText && <WelcomeBox welcomeText={welcomeText} />}

        <Box id="variable-input">
          <VariableInputForm chatStarted={chatStarted} chatForm={chatForm} chatType={chatType} />
        </Box>

        <ChatRecordsList {...recordsListProps} />
      </Box>
    </ScrollData>
  );
};

export default React.memo(AppChatMain);
