import React from 'react';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useChatBox } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatBox';
import { chatHeaderIconButtonStyle } from './ChatWindow/headerIconButtonStyle';

const MarkdownExportButton = ({
  history,
  reserveSpace
}: {
  history: ChatItemMiniType[];
  reserveSpace?: boolean;
}) => {
  const { t } = useTranslation();
  const { onExportChat } = useChatBox();
  const label = `Markdown ${t('common:Export')}`;

  return (
    <Box transform={reserveSpace ? 'translateX(-32px)' : 'none'}>
      <MyTooltip label={label}>
        <IconButton
          icon={
            <MyIcon
              name={'core/chat/markdown'}
              w={'16px'}
              color="currentColor"
              sx={{
                '& path': {
                  fill: 'currentColor'
                }
              }}
            />
          }
          aria-label={label}
          size={'sm'}
          variant="unstyled"
          {...chatHeaderIconButtonStyle}
          onClick={() => onExportChat({ type: 'md', history })}
        />
      </MyTooltip>
    </Box>
  );
};

export default React.memo(MarkdownExportButton);
