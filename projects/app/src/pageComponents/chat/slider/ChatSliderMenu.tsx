import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useTranslation } from 'react-i18next';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

type Props = {
  menuConfirmButtonText?: string;
};

const ChatSliderMenu = ({ menuConfirmButtonText }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const onClearHistory = useContextSelector(ChatContext, (v) => v.onClearHistories);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  return (
    <Flex
      w={'100%'}
      px={[2, 0]}
      h={'36px'}
      mt={isPc ? 2 : 5}
      mb={isPc ? 3 : 5}
      justify={['space-between', '']}
      alignItems={'center'}
      gap={isPc ? 2 : 0}
    >
      {!isPc && (
        <Flex height={'100%'} align={'center'} justify={'center'}>
          <MyIcon ml={2} name="core/chat/sideLine" />
          <Box ml={2} fontWeight={'bold'}>
            {t('common:core.chat.History')}
          </Box>
        </Flex>
      )}

      <Button
        variant={'whitePrimary'}
        flex={['0 0 auto', 1]}
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

      {isPc && histories.length > 0 && (
        <PopoverConfirm
          Trigger={
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
          }
          type="delete"
          content={menuConfirmButtonText || t('common:Delete')}
          onConfirm={() => onClearHistory()}
        />
      )}
    </Flex>
  );
};

export default ChatSliderMenu;
