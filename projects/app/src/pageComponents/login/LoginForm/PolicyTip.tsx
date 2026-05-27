import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Link } from '@chakra-ui/react';
import React from 'react';
import { Trans } from 'next-i18next';

const PolicyTip = () => {
  const { feConfigs } = useSystemStore();

  return (
    <>
      {feConfigs?.docUrl && (
        <Box
          display={'block'}
          textAlign={'center'}
          mt={8}
          fontSize={'mini'}
          lineHeight={'16px'}
          color={'myGray.400'}
          whiteSpace={'pre-wrap'}
        >
          <Trans
            i18nKey="login:policy_tip"
            components={{
              div: <Flex justifyContent={'center'} />,
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
