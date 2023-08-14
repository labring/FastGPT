import React, { useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuList, MenuButtonProps } from '@chakra-ui/react';
import { getLangStore, LangEnum, setLangStore } from '@/utils/i18n';
import MyIcon from '@/components/Icon';
import { useTranslation } from 'react-i18next';

const langMap = {
  [LangEnum.en]: {
    label: 'English',
    icon: 'language_en'
  },
  [LangEnum.zh]: {
    label: '简体中文',
    icon: 'language_zh'
  }
};

const Language = (props: MenuButtonProps) => {
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
