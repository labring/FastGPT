import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Portal
} from '@chakra-ui/react';
import { Drawer } from 'vaul';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import {
  ChatVariableFields,
  getChatVariableGroups
} from '@/components/core/chat/ChatContainer/ChatBox/components/ChatVariableForm';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { chatHeaderIconButtonStyle } from './headerIconButtonStyle';

type ChatVariableButtonProps = {
  chatType: ChatTypeEnum;
};

const ChatVariableContent = ({
  chatType,
  showSubmitButton = false,
  onSubmit
}: ChatVariableButtonProps & {
  showSubmitButton?: boolean;
  onSubmit?: () => void;
}) => {
  const { t } = useTranslation();
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const { commonVariableList, externalVariableList, internalVariableList } = useMemo(
    () => getChatVariableGroups({ variables, chatType }),
    [chatType, variables]
  );
  const visibleVariables = [
    ...internalVariableList,
    ...externalVariableList,
    ...commonVariableList
  ];

  return (
    <>
      <ChatVariableFields
        variables={visibleVariables}
        variablesForm={variablesForm}
        isUnChange={chatType === ChatTypeEnum.log}
      />
      {showSubmitButton && (
        <Flex justifyContent="flex-end" mt={8}>
          <Button
            w="69px"
            h="32px"
            px="20px"
            borderRadius="8px"
            fontSize="14px"
            variant="primary"
            onClick={variablesForm.handleSubmit(() => onSubmit?.())}
          >
            {t('common:Confirm')}
          </Button>
        </Flex>
      )}
    </>
  );
};

export const ChatVariableDrawer = ({
  isOpen,
  chatType,
  onClose
}: ChatVariableButtonProps & {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.16)',
            zIndex: 1400
          }}
        />
        <Drawer.Content
          style={{
            position: 'fixed',
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1401,
            outline: 'none'
          }}
        >
          <Box bg="white" borderTopRadius="16px" px="16px" pb="42px">
            <Flex justifyContent="center" py="16px">
              <Drawer.Handle style={{ backgroundColor: 'var(--chakra-colors-myGray-400)' }} />
            </Flex>
            <Flex alignItems="center" mb={4}>
              <Box fontSize="16px" fontWeight={600} color="myGray.900">
                {t('common:core.module.Variable')}
              </Box>
            </Flex>
            <Box
              maxH="70vh"
              overflowY="auto"
              overflowX="hidden"
              css={{
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none'
                }
              }}
            >
              <ChatVariableContent chatType={chatType} />
            </Box>
          </Box>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

const ChatVariableButton = ({ chatType }: ChatVariableButtonProps) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const [isOpen, setIsOpen] = useState(false);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState('72vh');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const hasVariables = useMemo(() => {
    const { commonVariableList, externalVariableList, internalVariableList } =
      getChatVariableGroups({
        variables,
        chatType
      });
    return (
      commonVariableList.length + externalVariableList.length + internalVariableList.length > 0
    );
  }, [chatType, variables]);

  const updatePopoverMaxHeight = useCallback(() => {
    const bottomGap = 12;
    const contentTop = popoverContentRef.current?.getBoundingClientRect().top;
    const buttonBottom = buttonRef.current?.getBoundingClientRect().bottom;
    const top = contentTop ?? buttonBottom;

    if (top === undefined) return;

    setPopoverMaxHeight(`${Math.max(window.innerHeight - top - bottomGap, 120)}px`);
  }, []);

  useEffect(() => {
    if (!isOpen || !isPc) return;

    updatePopoverMaxHeight();
    const rafId = window.requestAnimationFrame(updatePopoverMaxHeight);
    window.addEventListener('resize', updatePopoverMaxHeight);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePopoverMaxHeight);
    };
  }, [isOpen, isPc, updatePopoverMaxHeight]);

  if (!hasVariables) return null;

  const label = t('common:core.module.Variable');
  const iconButton = (
    <IconButton
      ref={buttonRef}
      icon={
        <MyIcon
          name="core/chat/var"
          w="16px"
          color="currentColor"
          sx={{
            '& path': {
              fill: 'currentColor'
            }
          }}
        />
      }
      aria-label={label}
      size="sm"
      variant="unstyled"
      {...chatHeaderIconButtonStyle}
      color={isOpen ? 'primary.600' : chatHeaderIconButtonStyle.color}
      onClick={() => {
        updatePopoverMaxHeight();
        setIsOpen(true);
      }}
    />
  );

  return (
    <>
      {isPc ? (
        <Popover
          isOpen={isOpen}
          onOpen={() => {
            updatePopoverMaxHeight();
            setIsOpen(true);
          }}
          onClose={() => setIsOpen(false)}
          placement="bottom-end"
          trigger="click"
          closeOnBlur
          isLazy
          lazyBehavior="unmount"
          autoFocus={false}
        >
          <PopoverTrigger>{iconButton}</PopoverTrigger>
          <Portal>
            <PopoverContent
              ref={popoverContentRef}
              zIndex={1001}
              border="1px solid"
              borderColor="myGray.100"
              borderRadius="12px"
              boxShadow="0 12px 32px rgba(19, 51, 107, 0.12), 0 0 1px rgba(19, 51, 107, 0.08)"
              overflow="hidden"
              w="368px"
              maxW="calc(100vw - 48px)"
              maxH={popoverMaxHeight}
            >
              <Box bg="white" p="24px" h="100%" overflowY="auto" overflowX="hidden">
                <Box fontSize="16px" lineHeight="24px" fontWeight={600} color="myGray.900" mb={6}>
                  {label}
                </Box>
                <ChatVariableContent
                  chatType={chatType}
                  showSubmitButton
                  onSubmit={() => {
                    setIsOpen(false);
                  }}
                />
              </Box>
            </PopoverContent>
          </Portal>
        </Popover>
      ) : (
        <MyTooltip label={label}>{iconButton}</MyTooltip>
      )}
      {!isPc && isOpen && (
        <ChatVariableDrawer isOpen={isOpen} chatType={chatType} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
};

export default React.memo(ChatVariableButton);
