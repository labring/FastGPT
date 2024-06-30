import { Box, Button, Flex } from '@chakra-ui/react';
import React from 'react';
import CollaboratorContextProvider, {
  MemberManagerInputPropsType
} from '@/components/support/permission/MemberManager/context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

function MemberManager({ managePer }: { managePer: MemberManagerInputPropsType }) {
  const { t } = useTranslation();
  return (
    <Box mt={4}>
      <CollaboratorContextProvider {...managePer}>
        {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
          return (
            <>
              <Flex alignItems="center" flexDirection="row" justifyContent="space-between" w="full">
                <Flex flexDirection="row" gap="2">
                  <Button
                    size="sm"
                    variant="whitePrimary"
                    leftIcon={<MyIcon w="4" name="common/settingLight" />}
                    onClick={onOpenManageModal}
                  >
                    {t('permission.Manage')}
                  </Button>
                  <Button
                    size="sm"
                    variant="whitePrimary"
                    leftIcon={<MyIcon w="4" name="support/permission/collaborator" />}
                    onClick={onOpenAddMember}
                  >
                    {t('common.Add')}
                  </Button>
                </Flex>
              </Flex>
              <MemberListCard mt={2} p={1.5} bg="myGray.100" borderRadius="md" />
            </>
          );
        }}
      </CollaboratorContextProvider>
    </Box>
  );
}

export default MemberManager;
