import { Box, Flex } from '@chakra-ui/react';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { formatTimeToChatItemTime } from '@fastgpt/global/common/string/time';

type HumanChatBubbleActionsProps = {
  chatText: string;
  chatTime?: Date;
};

const HumanChatBubbleActions = ({ chatText, chatTime }: HumanChatBubbleActionsProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  return (
    <Flex
      className="chat-controller-hover"
      display={'none'}
      position={'absolute'}
      right={0}
      top={'100%'}
      alignItems={'center'}
      gap={3}
      pt={'10px'}
      color={'myGray.500'}
      fontSize={'12px'}
      lineHeight={'24px'}
      whiteSpace={'nowrap'}
      zIndex={1}
    >
      {chatTime && (
        <Box>
          {t(formatTimeToChatItemTime(chatTime) as any, {
            time: dayjs(chatTime).format('HH:mm')
          }).replace('#', ':')}
        </Box>
      )}
      <Flex alignItems={'center'} gap={1}>
        <MyIcon
          w={'16px'}
          p={'4px'}
          cursor="pointer"
          name={'copy'}
          color={'myGray.500'}
          _hover={{ color: 'primary.600' }}
          onClick={() => copyData(chatText)}
        />
        {/* TODO: 当前只补齐用户消息编辑入口 UI，后续需要接入编辑消息接口和重新生成流程。 */}
        <MyIcon
          w={'16px'}
          p={'4px'}
          cursor="pointer"
          name={'edit'}
          color={'myGray.500'}
          _hover={{ color: 'primary.600' }}
        />
      </Flex>
    </Flex>
  );
};

export default HumanChatBubbleActions;
