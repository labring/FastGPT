import AccountContainer from '@/pageComponents/account/AccountContainer';
import { deleteCustomDomain, listCustomDomain } from '@/web/support/customDomain/api';
import {
  Box,
  Button,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import dynamic from 'next/dynamic';
import { providerMap, customDomainStatusMap } from '@/web/support/customDomain/const';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import type { CustomDomainType } from '@fastgpt/global/support/customDomain/type';
import { useState, useMemo } from 'react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRouter } from 'next/router';
import Tag from '@fastgpt/web/components/common/Tag';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const CreateCustomDomainModal = dynamic(
  () => import('@/pageComponents/account/customDomain/createModal'),
  { ssr: false }
);

/** unimplemented */
// const DomainVerifyModal = dynamic(
//   () => import('@/pageComponents/account/customDomain/domainVerifyModal')
// );

const CustomDomain = () => {
  const { t } = useClientTranslation(['account_custom_domain']);
  const router = useRouter();
  const { teamPlanStatus } = useUserStore();

  const {
    data: customDomainList,
    refreshAsync: refreshCustomDomainList,
    loading: loadingCustomDomainList
  } = useRequest(listCustomDomain, {
    manual: false
  });
  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();

  // const {
  //   isOpen: isOpenDomainVerify,
  //   onOpen: onOpenDomainVerify,
  //   onClose: onCloseDomainVerify
  // } = useDisclosure();

  const { runAsync: onDelete } = useRequest(deleteCustomDomain, {
    manual: true,
    successToast: t('common:Success'),
    onSuccess: () => refreshCustomDomainList()
  });

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('account_custom_domain:delete_confirm'),
    type: 'delete'
  });

  const [editDomain, setEditDomain] = useState<CustomDomainType | undefined>(undefined);

  // 检查用户是否支持使用自定义域名
  const isSupportCustomDomain = useMemo(() => {
    const plan = teamPlanStatus?.standard;
    if (!plan) return false;

    return !!(plan.customDomain && plan.customDomain > 0);
  }, [teamPlanStatus?.standard]);

  return (
    <>
      <AccountContainer>
        <Flex flexDirection="column" h="100%" minH={0}>
          <Flex
            h={'64px'}
            flexShrink={0}
            px={[4, 6]}
            alignItems={'center'}
            justifyContent={'space-between'}
            borderBottom={'1px solid'}
            borderColor={'myGray.200'}
          >
            <Box as={'h1'} {...accountTitleTextStyles}>
              {t('account_custom_domain:custom_domain')}
            </Box>
            {isSupportCustomDomain && (
              <Button variant="whitePrimaryOutline" onClick={onOpenCreateModal}>
                {t('common:Add')}
              </Button>
            )}
          </Flex>
          <TableContainer
            flex="1"
            minH={0}
            display="flex"
            flexDirection="column"
            position="relative"
            p={[4, 6]}
          >
            {loadingCustomDomainList ? <MyLoading fixed={false} /> : null}
            <Table>
              <Thead>
                <Tr>
                  <Td>{t('account_custom_domain:domain')}</Td>
                  <Td>CNAME</Td>
                  <Td>{t('account_custom_domain:provider')}</Td>
                  <Td>{t('common:Status')}</Td>
                  <Td>{t('common:Action')}</Td>
                </Tr>
              </Thead>
              <Tbody>
                {customDomainList?.length ? (
                  customDomainList.map((customDomain) => (
                    <Tr key={customDomain.domain}>
                      <Td>{customDomain.domain}</Td>
                      <Td>{customDomain.cnameDomain}</Td>
                      <Td>{t(providerMap[customDomain.provider])}</Td>
                      <Td>
                        {customDomain.status === 'active' ? (
                          <Tag colorSchema="green">
                            {t(customDomainStatusMap[customDomain.status])}
                          </Tag>
                        ) : (
                          <Tag colorSchema="red">
                            {t(customDomainStatusMap[customDomain.status])}
                          </Tag>
                        )}
                      </Td>
                      <Td>
                        <Flex gap="2">
                          <Button
                            variant="whiteDanger"
                            onClick={() => {
                              return openConfirm({
                                onConfirm: () => onDelete(customDomain.domain)
                              })();
                            }}
                          >
                            {t('common:Delete')}
                          </Button>
                          {customDomain.status === 'inactive' ? (
                            <Button
                              variant="whitePrimary"
                              onClick={() => {
                                setEditDomain(customDomain);
                                onOpenCreateModal();
                              }}
                            >
                              {t('common:Edit')}
                            </Button>
                          ) : (
                            <></>
                            // <Button
                            //   variant="whitePrimary"
                            //   onClick={() => {
                            //     setEditDomain(customDomain);
                            //     onOpenDomainVerify();
                            //   }}
                            // >
                            //   {t('account_custom_domain:domain_verify')}
                            // </Button>
                          )}
                        </Flex>
                      </Td>
                    </Tr>
                  ))
                ) : (
                  <Tr h="100%">
                    <Td colSpan={5} textAlign="center" h="100%">
                      <Flex
                        h="100%"
                        alignItems="center"
                        justifyContent="center"
                        minH="400px"
                        flexDirection="column"
                        gap={4}
                      >
                        <EmptyTip
                          text={
                            !isSupportCustomDomain && (
                              <Flex flexDir="column" alignItems="center">
                                <Box>{t('account_custom_domain:upgrade_to_use_custom_domain')}</Box>
                                <Button
                                  mt="4"
                                  variant="primary"
                                  onClick={() => router.push('/price')}
                                  size="md"
                                >
                                  {t('account_custom_domain:upgrade_plan')}
                                </Button>
                              </Flex>
                            )
                          }
                        />
                      </Flex>
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Flex>
      </AccountContainer>
      <ConfirmModal />
      {isOpenCreateModal && (
        <CreateCustomDomainModal
          onClose={() => {
            onCloseCreateModal();
            refreshCustomDomainList();
            setEditDomain(undefined);
          }}
          type={editDomain ? 'refresh' : 'create'}
          data={editDomain!}
        />
      )}
      {/*{isOpenDomainVerify && editDomain?.domain && (
        <DomainVerifyModal
          domain={editDomain?.domain}
          onClose={() => {
            onCloseDomainVerify();
            setEditDomain(undefined);
          }}
        />
      )}*/}
    </>
  );
};

export default CustomDomain;
