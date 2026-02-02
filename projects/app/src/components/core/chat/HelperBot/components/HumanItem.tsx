import React from 'react';
import type { HelperBotChatItemSiteType } from '@fastgpt/global/core/chat/helperBot/type';
import { formatChatValue2InputType } from '../../ChatContainer/ChatBox/utils';
import { Box, Card, Flex } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import FileBlock from '../../ChatContainer/ChatBox/components/FilesBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import type { UserChatItemType } from '@fastgpt/global/core/chat/type';

const HumanItem = ({ chat }: { chat: UserChatItemType }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { text, files = [] } = formatChatValue2InputType(chat.value);

  // TODO: delete chatitem

  return (
    <Flex
      direction={'column'}
      alignItems={'end'}
      _hover={{
        '& .controler': {
          display: 'flex'
        }
      }}
    >
      <Box
        px={4}
        py={3}
        borderRadius={'sm'}
        display="inline-block"
        maxW={['calc(100% - 25px)', 'calc(100% - 40px)']}
        color={'myGray.900'}
        bg={'primary.100'}
        order={0}
      >
        <Flex flexDirection={'column'} gap={4}>
          {files.length > 0 && <FileBlock files={files} />}
          {text && <Markdown source={text} />}
        </Flex>
      </Box>
      {/* Controller */}
      <Flex h={'26px'} mt={1}>
        {/* <Flex className="controler" display={['flex', 'none']} alignItems={'center'} gap={1}>
          <MyTooltip label={t('common:Copy')}>
            <MyIconButton icon="copy" color={'myGray.500'} onClick={() => copyData(text ?? '')} />
          </MyTooltip>
          <MyTooltip label={t('common:Delete')}>
            <MyIconButton
              icon="delete"
              color={'myGray.500'}
              hoverColor={'red.600'}
              hoverBg={'red.50'}
              onClick={() => copyData(text ?? '')}
            />
          </MyTooltip>
        </Flex> */}
      </Flex>
    </Flex>
  );
};

export default HumanItem;
