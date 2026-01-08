import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { providerMap, customDomainStatusMap } from '@/web/support/customDomain/const';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import type { CustomDomainType } from '@fastgpt/global/support/customDomain/type';
import { useState, useMemo } from 'react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useRouter } from 'next/router';
import Tag from '@fastgpt/web/components/common/Tag';

const CreateCustomDomainModal = dynamic(
  () => import('@/pageComponents/account/customDomain/createModal')
);

/** unimplemented */
// const DomainVerifyModal = dynamic(
//   () => import('@/pageComponents/account/customDomain/domainVerifyModal')
// );

const CustomDomain = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { teamPlanStatus } = useUserStore();

  const {
    data: customDomainList,
    refreshAsync: refreshCustomDomainList,
    loading: loadingCustomDomainList
  } = useRequest2(listCustomDomain, {
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

  const { runAsync: onDelete, loading: loadingDelete } = useRequest2(deleteCustomDomain, {
    manual: true,
    successToast: t('common:Success'),
    onSuccess: () => refreshCustomDomainList()
  });

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('account:custom_domain.delete_confirm'),
    type: 'delete'
  });

  const [editDomain, setEditDomain] = useState<CustomDomainType | undefined>(undefined);

  // 检查用户是否有 advanced 套餐
  const isAdvancedPlan = useMemo(() => {
    const plan = teamPlanStatus?.standard;
    if (!plan) return false;

    return plan.customDomain && plan.customDomain > 0;
  }, [teamPlanStatus?.standard]);

  return (
    <>
      <AccountContainer>
        <Flex flexDirection="column" h="100%" padding="24px">
          <TableContainer flex="1" display="flex" flexDirection="column">
            {loadingCustomDomainList ? <MyLoading /> : null}
            <Flex justifyContent="space-between" alignItems="center" w="100%">
              <Box fontSize="20px" fontWeight="500">
                {t('account:custom_domain')}
                {customDomainList?.length ? (
                  `: (${customDomainList.length}/${teamPlanStatus?.standardConstants?.customDomain})`
                ) : (
                  <></>
                )}
              </Box>

              <Button
                variant="whitePrimaryOutline"
                onClick={onOpenCreateModal}
                isDisabled={!isAdvancedPlan}
              >
                {t('common:Add')}
              </Button>
            </Flex>

            <Table marginTop="12px">
              <Thead>
                <Tr>
                  <Td>{t('account:custom_domain.domain')}</Td>
                  <Td>CNAME</Td>
                  <Td>{t('account:custom_domain.provider')}</Td>
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
                            //   {t('account:custom_domain.domain_verify')}
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
                            !isAdvancedPlan && (
                              <Flex flexDir="column" alignItems="center">
                                <Box>{t('account:upgrade_to_use_custom_domain')}</Box>
                                <Button
                                  mt="4"
                                  variant="primary"
                                  onClick={() => router.push('/price')}
                                  size="md"
                                >
                                  {t('account:upgrade_plan')}
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

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account']))
    }
  };
}
