import { Box, Button, Flex, FormLabel } from '@chakra-ui/react';
import React from 'react';
import CollaboratorContextProvider, {
  MemberManagerInputPropsType
} from '@/components/support/permission/MemberManager/context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

function MemberManager({ managePer }: { managePer: MemberManagerInputPropsType }) {
  const { t } = useTranslation();
  return (
    <Box>
      <CollaboratorContextProvider {...managePer}>
        {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
          return (
            <>
              <Flex alignItems="center" flexDirection="row" justifyContent="space-between" w="full">
                <Box color={'myGray.900'} fontSize={'mini'} fontWeight={'bold'}>
                  {t('common:permission.Collaborator')}
                </Box>
                <Flex gap={2}>
                  <Box>
                    <MyIcon
                      onClick={onOpenManageModal}
                      name="common/setting"
                      w={'1rem'}
                      h={'1rem'}
                      color={'myGray.600'}
                      cursor={'pointer'}
                      _hover={{ color: 'primary.500' }}
                    />
                  </Box>
                  <Box>
                    <MyIcon
                      cursor={'pointer'}
                      onClick={onOpenAddMember}
                      name="common/addUser"
                      _hover={{ color: 'primary.500' }}
                      w={'1rem'}
                      h={'1rem'}
                      color={'myGray.600'}
                    />
                  </Box>
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
