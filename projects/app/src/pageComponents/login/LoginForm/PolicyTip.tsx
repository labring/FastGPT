import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Link } from '@chakra-ui/react';
import React from 'react';
import { Trans } from 'next-i18next';

const PolicyTip = ({ isCenter }: { isCenter: boolean }) => {
  const { feConfigs } = useSystemStore();

  if (feConfigs?.showProtocol === false) return null;

  return (
    <Box
      display={isCenter ? 'block' : 'flex'}
      textAlign={isCenter ? 'center' : 'left'}
      mt={7}
      fontSize={'mini'}
      color={'myGray.400'}
      whiteSpace={'pre-wrap'}
    >
      <Trans
        i18nKey={'login:policy_tip'}
        components={{
          div: <Flex justifyContent={'center'} />,
          termsLink: (
            <Link
              href={feConfigs?.serviceProtocol || getDocPath('/docs/protocol/terms/')}
              target={'_blank'}
              color={'primary.700'}
            />
          ),
          privacyLink: (
            <Link
              href={feConfigs?.privacyProtocol || getDocPath('/docs/protocol/privacy/')}
              target={'_blank'}
              color={'primary.700'}
            />
          )
        }}
      />
    </Box>
  );
};

export default PolicyTip;
