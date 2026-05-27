import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { formatChatValue2InputType } from '../../utils/chatValue';

type AIChatBubbleFooterCopyProps = {
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
};

const AIChatBubbleFooterCopy = ({
  chatValue,
  isLastChild,
  isChatting
}: AIChatBubbleFooterCopyProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  if ('interactive' in chatValue[0] || (isChatting && isLastChild)) return null;

  return (
    <Box
      className="footer-copy"
      display={['block', 'none']}
      position={'absolute'}
      bottom={0}
      right={0}
      transform={'translateX(100%)'}
    >
      <MyTooltip label={t('common:Copy')}>
        <MyIcon
          w={'1rem'}
          cursor="pointer"
          p="5px"
          bg="white"
          name={'copy'}
          color={'myGray.500'}
          _hover={{ color: 'primary.600' }}
          onClick={() => copyData(formatChatValue2InputType(chatValue).text ?? '')}
        />
      </MyTooltip>
    </Box>
  );
};

export default AIChatBubbleFooterCopy;
