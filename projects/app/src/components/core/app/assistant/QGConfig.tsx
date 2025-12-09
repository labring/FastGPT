import { Box, Flex, Switch } from '@chakra-ui/react';

import React from 'react';
import { useTranslation } from 'next-i18next';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type.d';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from '../Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

// question generator config
const QGConfig = ({
  value = defaultQGConfig,
  onChange
}: {
  value?: AppQGConfigType;
  onChange: (e: AppQGConfigType) => void;
}) => {
  const { t } = useTranslation();

  const isOpenQG = value.open;

  return (
    <Flex>
      <Flex minW={'120px'} alignItems={'center'}>
        <FormLabel color={'myGray.900'}>{t('common:core.app.Question Guide')}</FormLabel>
        <ChatFunctionTip type={'nextQuestion'} />
      </Flex>
      <Switch
        isChecked={isOpenQG}
        onChange={(e) => {
          onChange({
            ...value,
            open: e.target.checked
          });
        }}
      />
    </Flex>
  );
};

export default QGConfig;
