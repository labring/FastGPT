import React, { useCallback, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Link,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Text
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

const certificationHref = '/account/info#certification';

const NoteIcon = () => (
  <Flex
    alignItems="center"
    justifyContent="center"
    flexShrink={0}
    mt="1px"
    w="18px"
    h="18px"
    borderRadius="5px"
    bg="blue.50"
    color="blue.600"
  >
    <MyIcon name="common/info" w="13px" h="13px" />
  </Flex>
);

const BenefitItem = ({ children }: { children: React.ReactNode }) => (
  <Flex as="li" alignItems="flex-start" gap={2}>
    <Flex
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      mt="2px"
      w="16px"
      h="16px"
      borderRadius="4px"
      bg="green.500"
      color="white"
    >
      <MyIcon name="common/check" w="11px" h="11px" />
    </Flex>
    <Box>{children}</Box>
  </Flex>
);

const EnterpriseAuthNoticeModal = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, setEnterpriseAuthNoticeRead } = useUserStore();
  const [isClosed, setIsClosed] = useState(false);

  const teamId = userInfo?.team?.teamId;

  const markAsRead = useCallback(() => {
    if (teamId) {
      setEnterpriseAuthNoticeRead(teamId);
    }
  }, [setEnterpriseAuthNoticeRead, teamId]);

  const onClickRead = useCallback(() => {
    markAsRead();
    setIsClosed(true);
  }, [markAsRead]);

  const onClickCertificationLink = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      markAsRead();
      webPushTrack.enterpriseAuthOpen({ source: 'notice' });
      await router.push(certificationHref);
    },
    [markAsRead, router]
  );

  if (isClosed) return null;

  return (
    <MyModal
      isOpen
      onClose={() => setIsClosed(true)}
      isCentered
      w={['90vw', '580px']}
      maxW={'90vw'}
      maxH="85vh"
      borderRadius={'10px'}
      overflow={'hidden'}
      boxShadow={'0px 0px 1px rgba(19, 51, 107, 0.1), 0px 4px 10px rgba(19, 51, 107, 0.1)'}
      showCloseButton={false}
    >
      <ModalCloseButton top={'8px'} right={'8px'} w={'36px'} h={'36px'} color={'myGray.700'} />

      <ModalBody
        px={['20px', '32px']}
        pt={['24px', '32px']}
        pb={0}
        flex={'1 1 auto'}
        minH={0}
        overflowY={'auto'}
      >
        <Flex flexDirection={'column'} gap={'24px'} overflow={'hidden'}>
          <Text
            color={'#000'}
            fontSize={'20px'}
            lineHeight={'26px'}
            letterSpacing={'0.15px'}
            fontWeight={500}
          >
            {t('account_team:enterprise_auth_notice_title')}
          </Text>

          <Box
            fontFamily="'PingFang SC', sans-serif"
            color="#111824"
            fontSize="14px"
            lineHeight="20px"
            letterSpacing={'0.25px'}
          >
            <Text fontSize="16px" fontWeight={600} lineHeight="24px" mb={4}>
              {t('account_team:enterprise_auth_notice_headline')}
            </Text>

            <Text mb={2}>{t('account_team:enterprise_auth_notice_greeting')}</Text>
            <Text mb={4}>{t('account_team:enterprise_auth_notice_intro')}</Text>

            <Box as="section" mb={4}>
              <Flex alignItems="flex-start" gap={2}>
                <NoteIcon />
                <Text>{t('account_team:enterprise_auth_notice_benefit_intro')}</Text>
              </Flex>

              <Flex as="ul" direction="column" gap={1} mt={1} pl={0} listStyleType="none">
                <BenefitItem>
                  {t('account_team:enterprise_auth_notice_benefit_advanced')}
                </BenefitItem>
                <BenefitItem>{t('account_team:enterprise_auth_notice_benefit_points')}</BenefitItem>
                <BenefitItem>
                  {t('account_team:enterprise_auth_notice_benefit_support')}
                </BenefitItem>
              </Flex>
            </Box>

            <Text mb={4}>
              <Box as="span" fontWeight={600}>
                {t('account_team:enterprise_auth_notice_entry')}
              </Box>
              {t('account_team:enterprise_auth_notice_or_click')}
              <Link
                href={certificationHref}
                color="primary.600"
                fontWeight={500}
                textDecoration="underline"
                onClick={onClickCertificationLink}
              >
                {t('account_team:enterprise_auth_notice_link')}
              </Link>
              {t('account_team:enterprise_auth_notice_link_suffix')}
            </Text>

            <Flex alignItems="flex-start" gap={2} mb={4}>
              <Text>{t('account_team:enterprise_auth_notice_activity_icon')}</Text>
              <Text>{t('account_team:enterprise_auth_notice_activity')}</Text>
            </Flex>

            <Text mb={6}>{t('account_team:enterprise_auth_notice_help')}</Text>

            <Box my={6} h="1px" bg="myGray.200" />

            <Text>{t('account_team:enterprise_auth_notice_footer')}</Text>
          </Box>
        </Flex>
      </ModalBody>

      <ModalFooter
        px={['20px', '32px']}
        pt={'24px'}
        pb={['24px', '32px']}
        justifyContent={'flex-end'}
      >
        <Button
          h={'32px'}
          w={'64px'}
          px={'14px'}
          fontSize={'12px'}
          fontWeight={500}
          letterSpacing={'0.5px'}
          bg={'#3370FF'}
          color={'white'}
          onClick={onClickRead}
          _hover={{ bg: '#2152D9' }}
          _active={{ bg: '#1F4CCF' }}
        >
          {t('account_team:enterprise_auth_notice_read')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(EnterpriseAuthNoticeModal);
