import React, { useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuList, MenuButtonProps } from '@chakra-ui/react';
import { getLangStore, LangEnum, setLangStore, langMap } from '@/utils/web/i18n';
import MyIcon from '@/components/Icon';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';

const Language = (props: MenuButtonProps) => {
  const router = useRouter();
  const { i18n } = useTranslation();

  const [language, setLanguage] = useState<`${LangEnum}`>(getLangStore());

  return (
    <Menu autoSelect={false}>
      <MenuButton
        {...props}
        sx={{
          '& span': {
            flex: 0
          }
        }}
      >
        <MyIcon name={langMap[language].icon as any} w={['18px', '22px']} />
      </MenuButton>
      <MenuList w="max-content" minW="120px">
        {Object.entries(langMap).map(([key, lang]) => (
          <MenuItem
            key={key}
            display="flex"
            alignItems="center"
            onClick={() => {
              const lang = key as `${LangEnum}`;
              setLangStore(lang);
              setLanguage(lang);
              i18n?.changeLanguage?.(lang);
              router.reload();
            }}
          >
            {lang.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default React.memo(Language);
