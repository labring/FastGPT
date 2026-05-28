import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Link } from '@chakra-ui/react';
import React from 'react';
import { Trans, useTranslation } from 'next-i18next';

const PolicyTip = () => {
  const { feConfigs } = useSystemStore();
  const { i18n } = useTranslation();
  const isEnglish = i18n.language === 'en';

  return (
    <>
      {feConfigs?.docUrl && (
        <Box
          display={'block'}
          textAlign={isEnglish ? 'center' : 'left'}
          mt={6}
          fontSize={'mini'}
          lineHeight={'16px'}
          color={'myGray.400'}
          whiteSpace={'pre-wrap'}
        >
          <Trans
            i18nKey="login:policy_tip"
            components={{
              div: <Flex justifyContent={isEnglish ? 'center' : 'flex-start'} />,
              termsLink: (
                <Link
                  href={getDocPath('/guide/version/cloud/terms')}
                  target={'_blank'}
                  color={'primary.700'}
                />
              ),
              privacyLink: (
                <Link
                  href={getDocPath('/guide/version/cloud/privacy')}
                  target={'_blank'}
                  color={'primary.700'}
                />
              )
            }}
          />
        </Box>
      )}
    </>
  );
};

export default PolicyTip;
