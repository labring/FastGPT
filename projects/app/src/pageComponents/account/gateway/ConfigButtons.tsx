import React from 'react';
import { Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
const ConfigButtons = () => {
  const { t } = useTranslation();

  return (
    <Flex>
      <Button
        variant="primaryOutline"
        mr={2}
        leftIcon={<MyIcon name="support/gate/home/savePrimary" />}
      >
        {t('account:gateway.save_config')}
      </Button>
      <Button variant={'primary'} mr={2} leftIcon={<MyIcon name="support/gate/home/shareLight" />}>
        {t('account:gateway.share')}
      </Button>
    </Flex>
  );
};

export default ConfigButtons;
