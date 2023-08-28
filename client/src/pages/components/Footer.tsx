import React, { useMemo } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import { feConfigs } from '@/store/static';
import { useTranslation } from 'react-i18next';
import Avatar from '@/components/Avatar';
import { useRouter } from 'next/router';
import CommunityModal from '@/components/CommunityModal';

const Footer = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const list = useMemo(
    () => [
      {
        label: t('home.Footer Product'),
        child: [
          {
            label: t('home.Footer FastGPT Cloud', { title: feConfigs.systemTitle }),
            onClick: () => {
              router.push('/app/list');
            }
          },
          {
            label: 'Sealos',
            onClick: () => {
              window.open('https://github.com/labring/sealos', '_blank');
            }
          },
          {
            label: 'Laf',
            onClick: () => {
              window.open('https://github.com/labring/laf', '_blank');
            }
          }
        ]
      },
      {
        label: t('home.Footer Developer'),
        child: [
          {
            label: t('home.Footer Git'),
            onClick: () => {
              window.open('https://github.com/labring/FastGPT', '_blank');
            }
          },
          {
            label: t('home.Footer Docs'),
            onClick: () => {
              window.open('https://doc.fastgpt.run/docs/intro', '_blank');
            }
          }
        ]
      },
      {
        label: t('home.Footer Support'),
        child: [
          {
            label: t('home.Footer Feedback'),
            onClick: () => {
              window.open('https://github.com/labring/FastGPT/issues', '_blank');
            }
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
            {feConfigs?.systemTitle}
          </Box>
        </Flex>
        <Box mt={5} fontSize={'sm'} color={'myGray.600'} maxW={'380px'} textAlign={'justify'}>
          {t('home.FastGPT Desc', { title: feConfigs.systemTitle })}
        </Box>
      </Box>
      {list.map((item) => (
        <Box key={item.label} w={'200px'} mt={[5, 0]}>
          <Box color={'myGray.500'}>{item.label}</Box>
          {item.child.map((child) => (
            <Box
              key={child.label}
              mt={[2, 3]}
              cursor={'pointer'}
              _hover={{ textDecoration: 'underline' }}
              onClick={child.onClick}
            >
              {child.label}
            </Box>
          ))}
        </Box>
      ))}
      {isOpen && <CommunityModal onClose={onClose} />}
    </Box>
  );
};

export default Footer;
