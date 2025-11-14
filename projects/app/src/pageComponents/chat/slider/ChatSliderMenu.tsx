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
      px={[2, 5]}
      h={'36px'}
      my={5}
      justify={['space-between', '']}
      alignItems={'center'}
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
        h={'100%'}
        px={6}
        color={'primary.600'}
        borderRadius={'xl'}
        leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
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
            <Box ml={3} h={'100%'}>
              <IconButton
                variant={'whiteDanger'}
                size={'mdSquare'}
                aria-label={''}
                borderRadius={'50%'}
                icon={<MyIcon name={'common/clearLight'} w={'16px'} />}
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
