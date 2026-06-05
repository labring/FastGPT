import { useContextSelector } from 'use-context-selector';
import type { ReactNode } from 'react';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Modal,
  ModalContent,
  ModalOverlay,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

type Props = {
  menuConfirmButtonText?: string;
};

const MobileClearHistoryConfirm = ({
  Trigger,
  onConfirm
}: {
  Trigger: ReactNode;
  onConfirm: () => Promise<unknown> | unknown;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { runAsync: confirmClearHistory, loading } = useRequest(async () => onConfirm(), {
    onSuccess: onClose
  });

  return (
    <>
      <Box onClick={onOpen}>{Trigger}</Box>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        isCentered
        autoFocus={false}
        blockScrollOnMount={false}
        returnFocusOnClose={false}
      >
        <ModalOverlay bg="rgba(0, 0, 0, 0.16)" zIndex={1500} />
        <ModalContent
          w="calc(100vw - 32px)"
          maxW="calc(100vw - 32px)"
          mx="16px"
          p="32px"
          borderRadius="10px"
          boxShadow="0 8px 24px rgba(19, 51, 107, 0.16)"
          containerProps={{ zIndex: 1501 }}
        >
          <IconButton
            aria-label={t('common:Close')}
            icon={<MyIcon name="common/closeLight" w="18px" h="18px" color="myGray.900" />}
            variant="unstyled"
            position="absolute"
            top="14px"
            right="14px"
            minW="28px"
            h="28px"
            color="myGray.900"
            onClick={onClose}
          />

          <HStack alignItems="center" spacing="14px" pr="32px">
            <Flex
              w="24px"
              h="24px"
              borderRadius="full"
              bg="#FFE9A8"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <MyIcon name="common/exclamationMark" w="14px" h="14px" color="#D96A00" />
            </Flex>
            <Box fontSize="20px" lineHeight="28px" fontWeight={600} color="myGray.900">
              {t('chat:mobile_clear_history_confirm_title')}
            </Box>
          </HStack>

          <Box mt="24px" fontSize="14px" lineHeight="22px" color="myGray.900">
            {t('chat:mobile_clear_history_confirm_tip')}
          </Box>

          <HStack mt="24px" justifyContent="flex-end" spacing="12px">
            <Button
              minH="32px"
              px="14px"
              py="8px"
              variant="whiteBase"
              fontSize="12px"
              borderRadius="7px"
              onClick={onClose}
              isDisabled={loading}
            >
              {t('common:Cancel')}
            </Button>
            <Button
              minH="32px"
              px="14px"
              py="8px"
              variant="dangerFill"
              fontSize="12px"
              borderRadius="7px"
              isLoading={loading}
              onClick={() => void confirmClearHistory()}
            >
              {t('common:Clear')}
            </Button>
          </HStack>
        </ModalContent>
      </Modal>
    </>
  );
};

const ChatSliderMenu = ({ menuConfirmButtonText }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const onClearHistory = useContextSelector(ChatContext, (v) => v.onClearHistories);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const ClearHistoryTrigger = (
    <Box h={'100%'}>
      <IconButton
        variant={'whiteBase'}
        size={'mdSquare'}
        aria-label={''}
        boxSize={'36px'}
        minW={'36px'}
        p={'10px'}
        borderRadius={'999px'}
        borderColor={'myGray.250'}
        bg={'white'}
        boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08)'}
        color={'myGray.500'}
        _hover={{
          color: 'red.600',
          borderColor: 'red.300'
        }}
        icon={<MyIcon name={'common/clearLight'} w={'16px'} color={'currentColor'} />}
      />
    </Box>
  );

  return (
    <Flex
      w={'100%'}
      px={0}
      minH={'36px'}
      pb={['12px', 0]}
      mt={isPc ? 2 : 0}
      mb={isPc ? 3 : 0}
      justify={['space-between', '']}
      alignItems={'center'}
      gap={isPc ? 2 : 0}
    >
      {!isPc && (
        <Flex height={'100%'} align={'center'} justify={'center'}>
          <Box fontWeight={'bold'}>{t('common:core.chat.History')}</Box>
        </Flex>
      )}

      {isPc ? (
        <Button
          variant={'whitePrimary'}
          flex={1}
          h={'36px'}
          minH={'36px'}
          px={'14px'}
          py={'8px'}
          color={'primary.600'}
          borderRadius={'9999px'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          bg={'white'}
          boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08)'}
          leftIcon={
            <MyIcon
              name={'core/chat/chatLight'}
              w={'16px'}
              h={'16px'}
              color={'primary.600'}
              fill={'primary.600'}
            />
          }
          overflow={'hidden'}
          onClick={() => {
            onChangeChatId();
            setCiteModalData(undefined);
          }}
        >
          {t('common:core.chat.New Chat')}
        </Button>
      ) : (
        histories.length > 0 && (
          <MobileClearHistoryConfirm
            Trigger={ClearHistoryTrigger}
            onConfirm={() => onClearHistory()}
          />
        )
      )}

      {isPc && histories.length > 0 && (
        <PopoverConfirm
          Trigger={ClearHistoryTrigger}
          type="delete"
          content={menuConfirmButtonText || t('common:Delete')}
          onConfirm={() => onClearHistory()}
        />
      )}
    </Flex>
  );
};

export default ChatSliderMenu;
