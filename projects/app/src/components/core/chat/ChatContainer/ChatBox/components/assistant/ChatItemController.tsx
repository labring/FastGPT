import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { Flex, type FlexProps, useTheme, Box, Tag, useDisclosure, Text } from '@chakra-ui/react';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatChatValue2InputType } from '../../utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useContextSelector } from 'use-context-selector';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const StandaloneResponseModal = dynamic(
  () => import('../../../../components/StandaloneResponseModal')
);
const AssistantDetailModal = dynamic(() => import('../../../../components/AssistantDetailModal'));

export type ChatItemControllerProps = {
  isLastChild: boolean;
  chat: ChatSiteItemType & ChatItemType;
  onCorrectError?: () => void; // 纠错回调
};

// 统一的图标按钮样式
const iconButtonStyle = {
  w: '24px',
  h: '24px',
  borderRadius: '4px',
  border: '1px solid',
  borderColor: 'myGray.200',
  cursor: 'pointer'
};

// 图标样式
const iconStyle = {
  w: '12px',
  color: 'myGray.600'
};

// 纠错按钮样式
const correctButtonStyle = {
  px: 2,
  display: 'flex',
  alignItems: 'center',
  ml: 1,
  borderRadius: '4px',
  border: '1px solid',
  cursor: 'pointer',
  fontSize: '0.85rem',
  borderColor: 'myGray.200',
  height: '24px'
};

// 图标按钮组件
const IconButton = ({
  name,
  onClick,
  tooltip,
  ...props
}: {
  name: string;
  onClick?: () => void;
  tooltip?: string;
  [key: string]: any;
}) => {
  return (
    <MyTooltip label={tooltip}>
      <Box {...iconButtonStyle} _hover={{ color: 'primary.600' }} {...props}>
        <MyIcon {...iconStyle} p="5px" name={name as any} onClick={onClick} />
      </Box>
    </MyTooltip>
  );
};

const ChatItemController = ({ chat, onCorrectError }: ChatItemControllerProps & FlexProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  // 从 ChatItemContext 获取 chatBoxData
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const appId = chatBoxData?.appId;
  const chatId = chatBoxData?.chatId;
  const outLinkAuthData = {};

  const isAssistantType = chatBoxData?.app?.type === AppTypeEnum.assistant;

  const chatText = useMemo(() => formatChatValue2InputType(chat.value).text || '', [chat.value]);

  // 查看详情模态框状态
  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();

  const chatTime = chat.time || new Date();

  // 判断是否为AI角色
  const isAI = chat.obj === ChatRoleEnum.AI;

  // 处理查看完整响应
  const handleViewFullResponse = useCallback(async () => {
    onOpenWholeModal();
  }, [onOpenWholeModal]);

  // 截断用户反馈内容
  const truncateFeedback = useCallback((feedback: string, maxLength: number = 20) => {
    if (feedback.length <= maxLength) return feedback;
    return feedback.substring(0, maxLength) + '...';
  }, []);

  // 渲染左侧控制按钮
  const renderLeftControls = () => {
    const controls = [];

    // 复制按钮
    controls.push(
      <IconButton
        key="copy"
        name="copy"
        onClick={() => copyData(chatText)}
        tooltip={t('common:Copy')}
      />
    );

    // AI特有的按钮
    if (isAI) {
      // 查看完整响应按钮
      controls.push(
        <IconButton
          key="view-full"
          name="common/userInfo"
          onClick={handleViewFullResponse}
          tooltip={t('chat:chat_response_complete')}
        />
      );

      controls.push(
        <Box key="correct" {...correctButtonStyle} onClick={() => onCorrectError?.()}>
          <MyIcon {...iconStyle} p={0} mr={1} name={'kbTest'} />
          <Text fontSize={'11px'} color={'myGray.600'}>
            {t('app:chat_item_correct_error')}
          </Text>
        </Box>
      );

      // 已优化标签 - 只有存在correctionId时才显示
      if (chat.correctionId) {
        controls.push(
          <MyTag
            mr={3}
            ml={1}
            type={'borderFill'}
            fontSize={'10px'}
            height={'22px'}
            showDot
            colorSchema="green"
            border={'none'}
            borderRadius={'22px'}
          >
            {t('app:chat_item_optimized')}
          </MyTag>
        );
      }
    }

    return <Flex alignItems={'center'}>{controls}</Flex>;
  };

  // 渲染右侧反馈和时间信息
  const renderRightInfo = () => {
    const elements = [];
    // AI角色的用户反馈显示
    if (isAI) {
      if (chat.userGoodFeedback) {
        elements.push(
          <MyTag key="good-feedback" colorSchema="green">
            <MyIcon name="core/chat/feedback/goodLight" w="14px" h="14px" mr={1} />
            <Text fontSize="xs" fontWeight={500}>
              {t('app:chat_item_liked')}
            </Text>
          </MyTag>
        );
      }
      if (chat.userBadFeedback) {
        elements.push(
          <MyTooltip label={chat.userBadFeedback}>
            <MyTag colorSchema="yellow">
              <MyIcon name="core/chat/feedback/badLight" w="14px" h="14px" mr={1} />
              <Text fontSize="xs" fontWeight={500}>
                {truncateFeedback(chat.userBadFeedback)}
              </Text>
            </MyTag>
          </MyTooltip>
        );
      }
      if (chat.totalQuoteList && chat.totalQuoteList.length === 0) {
        elements.push(
          <MyTag key="quote-list" colorSchema="pink" showDot={false}>
            <Flex alignItems={'center'}>
              <MyIcon w={'14px'} name="common/info" mr={1} />
              <Text fontSize="xs" fontWeight={500}>
                {t('app:logs_filter_not_found_knowledge')}
              </Text>
            </Flex>
          </MyTag>
        );
      }
    }

    // 时间显示
    elements.push(
      <Box key="time" fontSize="xs" color="#CCCCCC" whiteSpace="nowrap">
        {dayjs(chatTime).format('MM-DD HH:mm:ss')}
      </Box>
    );

    return (
      <Flex alignItems="center" gap={2}>
        {elements}
      </Flex>
    );
  };

  return (
    <>
      <Flex justifyContent="space-between" alignItems="center" w="100%" className="dd">
        {/* 左侧控制按钮 */}
        {renderLeftControls()}

        {/* 右侧反馈和时间信息 */}
        {renderRightInfo()}
      </Flex>

      {/* 查看详情模态框 */}
      {isOpenWholeModal && isAssistantType && (
        <AssistantDetailModal
          isOpen={isOpenWholeModal}
          onClose={onCloseWholeModal}
          dataId={chat.dataId}
          appId={appId || ''}
          chatId={chatId}
          outLinkAuthData={outLinkAuthData}
        />
      )}
      {isOpenWholeModal && !isAssistantType && (
        <StandaloneResponseModal
          isOpen={isOpenWholeModal}
          onClose={onCloseWholeModal}
          dataId={chat.dataId}
          appId={appId || ''}
          chatId={chatId}
          chatTime={chatTime}
          outLinkAuthData={outLinkAuthData}
        />
      )}
    </>
  );
};

export default React.memo(ChatItemController);
