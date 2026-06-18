import { Box, Flex } from '@chakra-ui/react';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { formatTimeToChatItemTime } from '@fastgpt/global/common/string/time';

type HumanChatBubbleActionsProps = {
  chatText: string;
  chatTime?: Date;
  onEdit: () => void;
  canEdit?: boolean;
  isAlwaysVisible?: boolean;
};

const HumanChatBubbleActions = ({
  chatText,
  chatTime,
  onEdit,
  canEdit = true,
  isAlwaysVisible = false
}: HumanChatBubbleActionsProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  return (
    <Flex
      className="chat-controller-hover"
      display={isAlwaysVisible ? 'flex' : 'none'}
      position={'absolute'}
      right={0}
      top={'100%'}
      alignItems={'center'}
      gap={3}
      pt={'10px'}
      color={'myGray.400'}
      fontSize={'12px'}
      fontWeight={500}
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
        <MyTooltip label={t('common:Copy')}>
          <MyIcon
            w={'16px'}
            p={'4px'}
            cursor="pointer"
            name={'copy'}
            color={'myGray.400'}
            _hover={{ color: 'primary.600' }}
            onClick={() => copyData(chatText)}
          />
        </MyTooltip>
        {canEdit && (
          <MyTooltip label={t('common:Edit')}>
            <MyIcon
              w={'16px'}
              p={'4px'}
              cursor="pointer"
              name={'edit'}
              color={'myGray.400'}
              _hover={{ color: 'primary.600' }}
              onClick={onEdit}
            />
          </MyTooltip>
        )}
      </Flex>
    </Flex>
  );
};

export default HumanChatBubbleActions;
