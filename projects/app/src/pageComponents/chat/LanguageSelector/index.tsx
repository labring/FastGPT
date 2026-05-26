import React, { useCallback } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import PhoneDrawer from '@fastgpt/web/components/common/PhoneDrawer';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import LanguageMenuItems from './LanguageMenuItems';
import LanguageMenuTrigger from './LanguageMenuTrigger';
import { type ChatLanguageSelectorMode, useChatLanguageSwitch } from './useChatLanguageSwitch';

type Props = {
  mode: ChatLanguageSelectorMode;
  isCollapsed?: boolean;
  onSelected?: () => void;
};

const ChatLanguageSelector = ({ mode, isCollapsed = false, onSelected }: Props) => {
  const { isPc } = useSystem();
  const { isOpen, onOpen, onClose: onCloseDrawer } = useDisclosure();
  const { currentLang, currentLabel, onChangeLanguage } = useChatLanguageSwitch(mode);
  const entryIcon = mode === 'share' ? 'common/language/translate' : 'common/globalLine';
  const triggerBoxProps =
    mode === 'share' ? { display: 'inline-flex', w: 'fit-content', maxW: '100%' } : { w: '100%' };

  const onSelect = useCallback(
    (lng: localeType, close?: () => void) => {
      return onChangeLanguage(lng, () => {
        onSelected?.();
        close?.();
      });
    },
    [onChangeLanguage, onSelected]
  );

  const entry = (
    <LanguageMenuTrigger iconName={entryIcon} label={currentLabel} isCollapsed={isCollapsed} />
  );

  if (isPc) {
    return (
      <MyPopover
        Trigger={
          <Box cursor="pointer" {...triggerBoxProps}>
            {entry}
          </Box>
        }
        trigger="click"
        placement={isCollapsed ? 'right-end' : 'top-start'}
        w="178px"
        closeOnBlur
      >
        {({ onClose }) => (
          <Flex p={2} direction="column" gap={1}>
            <LanguageMenuItems
              currentLang={currentLang}
              variant="list"
              onSelect={(lng) => onSelect(lng, onClose)}
            />
          </Flex>
        )}
      </MyPopover>
    );
  }

  return (
    <>
      <Box cursor="pointer" onClick={onOpen} {...triggerBoxProps}>
        {entry}
      </Box>

      <PhoneDrawer isOpen={isOpen} onClose={onCloseDrawer}>
        <Flex flexDirection="column" w="100%">
          <LanguageMenuItems
            currentLang={currentLang}
            variant="mobileList"
            onSelect={(lng) => onSelect(lng, onCloseDrawer)}
          />
        </Flex>
      </PhoneDrawer>
    </>
  );
};

export default React.memo(ChatLanguageSelector);
