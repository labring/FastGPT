import React, { useMemo, useState } from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { Drawer } from 'vaul';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import {
  ChatVariableFields,
  getChatVariableGroups
} from '@/components/core/chat/ChatContainer/ChatBox/components/ChatVariableForm';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

type ChatVariableButtonProps = {
  chatType: ChatTypeEnum;
};

const ChatVariableContent = ({ chatType }: ChatVariableButtonProps) => {
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
    <ChatVariableFields
      variables={visibleVariables}
      variablesForm={variablesForm}
      isUnChange={chatType === ChatTypeEnum.log}
    />
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
            <Flex justifyContent="center" pt="10px" pb={4}>
              <Drawer.Handle />
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

  if (!hasVariables) return null;

  const label = t('common:core.module.Variable');
  const button = (
    <MyTooltip label={label}>
      <IconButton
        icon={<MyIcon name="core/chat/var" w="16px" />}
        aria-label={label}
        size="sm"
        variant="whitePrimary"
        onClick={() => setIsOpen(true)}
      />
    </MyTooltip>
  );

  return (
    <>
      {isPc ? (
        <MyPopover placement="bottom-end" trigger="click" closeOnBlur Trigger={button}>
          {() => (
            <Box p={4} w="360px" maxH="60vh" overflowY="auto" overflowX="hidden">
              <ChatVariableContent chatType={chatType} />
            </Box>
          )}
        </MyPopover>
      ) : (
        button
      )}
      {!isPc && isOpen && (
        <ChatVariableDrawer isOpen={isOpen} chatType={chatType} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
};

export default React.memo(ChatVariableButton);
