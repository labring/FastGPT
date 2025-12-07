import AccountContainer from '@/pageComponents/account/AccountContainer';
import IconButton from '@/pageComponents/account/team/OrgManage/IconButton';
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
import { useState } from 'react';

const CreateCustomDomainModal = dynamic(
  () => import('@/pageComponents/account/customDomain/createModal')
);

const CustomDomain = () => {
  const { t } = useTranslation();
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

  const { runAsync: onDelete, loading: loadingDelete } = useRequest2(deleteCustomDomain, {
    manual: true,
    successToast: t('common:Success'),
    onSuccess: () => refreshCustomDomainList()
  });

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('account:custom_domain.delete_confirm')
  });

  const [editDomain, setEditDomain] = useState<CustomDomainType | undefined>(undefined);

  return (
    <>
      <AccountContainer>
        <Flex flexDirection="column" h="100%" padding="24px">
          <TableContainer flex="1" display="flex" flexDirection="column">
            {loadingCustomDomainList ? <MyLoading /> : null}
            <Flex justifyContent="space-between" alignItems="center" w="100%">
              <Box fontSize="20px" fontWeight="500">
                {t('account:custom_domain')}
                {customDomainList?.length ? `: (${customDomainList.length}/3)` : <></>}
              </Box>
              <Button variant="outline" onClick={onOpenCreateModal}>
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
                      <Td>{t(customDomainStatusMap[customDomain.status])}</Td>
                      <Td>
                        {customDomain.status === 'inactive' ? (
                          <IconButton
                            name="edit"
                            onClick={() => {
                              setEditDomain(customDomain);
                              onOpenCreateModal();
                            }}
                          />
                        ) : (
                          <></>
                        )}
                        <IconButton
                          name="delete"
                          onClick={() => {
                            return openConfirm(() => onDelete(customDomain.domain))();
                          }}
                        ></IconButton>
                      </Td>
                    </Tr>
                  ))
                ) : (
                  <Tr h="100%">
                    <Td colSpan={5} textAlign="center" h="100%">
                      <Flex h="100%" alignItems="center" justifyContent="center" minH="400px">
                        <EmptyTip />
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
