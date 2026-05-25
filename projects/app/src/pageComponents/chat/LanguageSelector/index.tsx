import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { langMap, LangEnum } from '@fastgpt/global/common/i18n/type';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';
import { getLangMapping, SHARE_LANG_KEY } from '@fastgpt/web/i18n/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useToast } from '@fastgpt/web/hooks/useToast';

type LanguageSelectorMode = 'account' | 'share';

type Props = {
  mode: LanguageSelectorMode;
  isCollapsed?: boolean;
  variant?: 'sidebar' | 'menuList' | 'mobileSheetList';
  onSelected?: () => void;
};

const languageList = [LangEnum.zh_CN, LangEnum.zh_Hant, LangEnum.en];

/**
 * 移动端语言选择统一使用同一个底部弹层。
 * 门户只是在同一弹层里额外传入登出行，避免免登录和门户两套 UI 逐渐漂移。
 */
export const ChatLanguageMobileSheet = ({
  isOpen,
  onClose,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  return (
    <Drawer placement="bottom" size="xs" isOpen={isOpen} onClose={onClose}>
      <DrawerOverlay backgroundColor="rgba(0, 0, 0, 0.16)" />
      <DrawerContent bg="white" borderTopRadius="16px" overflow="hidden" pt={0} pb="50px">
        <Flex justifyContent="center" py={4}>
          <Box w="32px" h="4px" borderRadius="100px" bg="myGray.400" />
        </Flex>
        <DrawerBody px={4} py={0}>
          <Flex direction="column" gap={3}>
            {children}
          </Flex>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

const ChatLanguageSelector = ({
  mode,
  isCollapsed = false,
  variant = 'sidebar',
  onSelected
}: Props) => {
  const { i18n, t } = useTranslation();
  const { isPc } = useSystem();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { onChangeLng } = useI18nLng();
  const { userInfo, updateUserInfo } = useUserStore();
  const username = userInfo?.username;
  const currentLang = getLangMapping(i18n.language) as `${LangEnum}`;
  const isMobileSheetList = variant === 'mobileSheetList' || (!isPc && variant === 'sidebar');
  const isPlainList = variant === 'menuList' || isMobileSheetList;
  // 免登录分享页不写平台 NEXT_LOCALE，避免影响用户回到门户后的语言。
  const languageStorageKey = mode === 'share' ? SHARE_LANG_KEY : undefined;

  const currentLabel = useMemo(() => {
    return langMap[currentLang]?.label || langMap[LangEnum.zh_CN].label;
  }, [currentLang]);
  const entryIcon = mode === 'share' ? 'common/language/translate' : 'common/globalLine';

  const onChangeLanguage = useCallback(
    async (lng: `${LangEnum}`) => {
      try {
        if (mode === 'account' && username) {
          await updateUserInfo({
            language: lng
          });
        }

        await onChangeLng(lng, languageStorageKey, { reloadOnMissing: true });
        onSelected?.();
        onClose();
      } catch {
        toast({
          status: 'error',
          title: t('common:language_switch_failed')
        });
      }
    },
    [languageStorageKey, mode, onChangeLng, onClose, onSelected, t, toast, updateUserInfo, username]
  );

  const entry = (
    <Flex
      alignItems="center"
      justifyContent="flex-start"
      gap={1}
      h="40px"
      px={isCollapsed ? 0 : 2}
      py={1}
      borderRadius="4px"
      cursor="pointer"
      color="myGray.600"
      _hover={{ bg: 'myGray.100' }}
    >
      <Flex alignItems="center" gap={1} flex="1 1 0" minW={0}>
        <MyIcon name={entryIcon} w="18px" color="currentColor" flexShrink={0} />
        {!isCollapsed && (
          <Box fontSize="14px" lineHeight="20px" className="textEllipsis">
            {currentLabel}
          </Box>
        )}
      </Flex>
    </Flex>
  );

  const languageOptions = (
    <>
      {languageList.map((lng) => {
        const isSelected = currentLang === lng;
        const optionContent = (
          <Flex alignItems="center" justifyContent="space-between" w="100%">
            <Box>{langMap[lng].label}</Box>
            {isSelected && <MyIcon name="common/language/check" w="16px" />}
          </Flex>
        );

        if (isPlainList) {
          return (
            <Flex
              key={lng}
              alignItems="center"
              justifyContent="space-between"
              h={isMobileSheetList ? '44px' : '30px'}
              px={2}
              py={1}
              borderRadius="4px"
              cursor="pointer"
              bg={isSelected ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
              color={isSelected ? 'primary.600' : 'myGray.600'}
              fontSize={isMobileSheetList ? '16px' : '14px'}
              fontWeight={isMobileSheetList ? 500 : undefined}
              lineHeight={isMobileSheetList ? '24px' : '20px'}
              letterSpacing={isMobileSheetList ? '0.15px' : undefined}
              _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
              onClick={() => onChangeLanguage(lng)}
            >
              {optionContent}
            </Flex>
          );
        }

        return (
          <MenuItem
            key={lng}
            h="44px"
            borderRadius="6px"
            bg={isSelected ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
            color={isSelected ? 'primary.600' : 'myGray.900'}
            fontSize="14px"
            lineHeight="20px"
            _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
            onClick={() => onChangeLanguage(lng)}
          >
            {optionContent}
          </MenuItem>
        );
      })}
    </>
  );

  if (variant === 'menuList' || variant === 'mobileSheetList') {
    return (
      <Flex flexDirection="column" w="100%">
        {languageOptions}
      </Flex>
    );
  }

  if (isPc) {
    return (
      <Menu placement={isCollapsed ? 'right-end' : 'top-start'} autoSelect={false}>
        <MenuButton as={Box} w="100%">
          {entry}
        </MenuButton>
        <MenuList p={1} minW="180px" borderRadius="8px" boxShadow="2">
          {languageOptions}
        </MenuList>
      </Menu>
    );
  }

  return (
    <>
      <Box onClick={onOpen}>{entry}</Box>

      <ChatLanguageMobileSheet isOpen={isOpen} onClose={onClose}>
        <Flex flexDirection="column" w="100%">
          {languageOptions}
        </Flex>
      </ChatLanguageMobileSheet>
    </>
  );
};

export default ChatLanguageSelector;
