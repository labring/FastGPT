import React, { useMemo } from 'react';
import { Box, Flex, Link, useDisclosure } from '@chakra-ui/react';
import { feConfigs } from '@/web/common/system/staticData';
import { useTranslation } from 'next-i18next';
import Avatar from '@/components/Avatar';
import CommunityModal from '@/components/CommunityModal';

const Footer = () => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const list = useMemo(
    () => [
      {
        label: t('home.Footer Product'),
        child: [
          {
            label: t('home.Footer FastGPT Cloud'),
            url: feConfigs?.loginUrl
          },
          {
            label: 'Sealos',
            url: 'https://github.com/labring/sealos'
          },
          {
            label: 'Laf',
            url: 'https://github.com/labring/laf'
          }
        ]
      },
      {
        label: t('home.Footer Developer'),
        child: [
          {
            label: t('home.Footer Git'),
            url: ' https://github.com/labring/FastGPT'
          },
          {
            label: t('home.Footer Docs'),
            url: feConfigs?.docUrl
          }
        ]
      },
      {
        label: t('home.Footer Support'),
        child: [
          {
            label: t('home.Footer Feedback'),
            url: 'https://github.com/labring/FastGPT/issues'
          },
          {
            label: t('home.Community'),
            onClick: () => {
              onOpen();
            }
          }
        ]
      }
    ],
    [onOpen, t]
  );

  return (
    <Box
      display={['block', 'flex']}
      px={[5, 0]}
      maxW={'1200px'}
      m={'auto'}
      py={['30px', '60px']}
      flexWrap={'wrap'}
    >
      <Box flex={1}>
        <Flex alignItems={'center'}>
          <Avatar src="/icon/logo.svg" w={['24px', '30px']} />
          <Box
            className="textlg"
            fontSize={['xl', '2xl']}
            fontWeight={'bold'}
            ml={3}
            fontStyle={'italic'}
          >
            FastGPT
          </Box>
        </Flex>
        <Box mt={5} fontSize={'sm'} color={'myGray.600'} maxW={'380px'} textAlign={'justify'}>
          {t('home.FastGPT Desc')}
        </Box>
      </Box>
      {list.map((item) => (
        <Box key={item.label} w={'200px'} mt={[5, 0]}>
          <Box color={'myGray.500'}>{item.label}</Box>
          {item.child.map((child) =>
            child.url ? (
              <Link
                key={child.label}
                mt={[2, 3]}
                href={child.url}
                display={'block'}
                target="_blank"
              >
                {child.label}
              </Link>
            ) : (
              <Box
                key={child.label}
                mt={[2, 3]}
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={child.onClick}
              >
                {child.label}
              </Box>
            )
          )}
        </Box>
      ))}
      {isOpen && <CommunityModal onClose={onClose} />}
    </Box>
  );
};

export default Footer;
