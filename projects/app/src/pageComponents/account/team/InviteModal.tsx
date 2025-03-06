import MemberTag from '@/components/support/user/team/Info/MemberTag';
import Empty from '@/pageComponents/chat/Empty';
import { getInvitationLinkList, putUpdateInvitationInfo } from '@/web/support/user/team/api';
import {
  Box,
  Button,
  Divider,
  Flex,
  Grid,
  HStack,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  ModalHeader,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import Icon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import Tag from '@fastgpt/web/components/common/Tag';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import format from 'date-fns/format';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useCallback } from 'react';

const CreateInvitationModal = dynamic(() => import('./CreateInvitationModal'));

const InviteModal = ({
  teamId,
  onClose,
  onSuccess
}: {
  teamId: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useTranslation();

  const {
    data: invitationLinkList,
    loading: isLoadingLink,
    runAsync: refetchInvitationLinkList
  } = useRequest2(() => getInvitationLinkList(), {
    manual: false
  });

  const { isOpen: isOpenCreate, onOpen: onOpenCreate, onClose: onCloseCreate } = useDisclosure();

  const isLoading = isLoadingLink;
  const { copyData } = useCopyData();

  const onCopy = useCallback(
    (linkId: string) => {
      copyData(location.origin + `/account/team?invitelinkid=${linkId}`);
    },
    [copyData]
  );

  const { runAsync: onForbid } = useRequest2(
    (linkId: string) =>
      putUpdateInvitationInfo({
        linkId,
        forbidden: true
      }),
    {
      manual: true,
      onSuccess: refetchInvitationLinkList,
      successToast: t('account_team:forbid_success')
    }
  );

  return (
    <MyModal
      isLoading={isLoading}
      isOpen
      iconSrc="common/inviteLight"
      iconColor="primary.600"
      minW={'600px'}
      title={
        <Box>
          <Box>{t('common:user.team.Invite Member')}</Box>
          <Box color={'myGray.500'} fontSize={'xs'} fontWeight={'normal'}>
            {t('common:user.team.Invite Member Tips')}
          </Box>
        </Box>
      }
      maxW={['90vw']}
      overflow={'unset'}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalHeader pb="0">
        <Flex alignItems={'center'} justifyContent={'space-between'} mx="2">
          <HStack>
            <Icon name="common/list" w="16px" />
            <Box ml="6px" fontSize="md">
              {t('account_team:invitation_link_list')}
            </Box>
          </HStack>
          <Button onClick={onOpenCreate}>{t('account_team:create_invitation_link')}</Button>
        </Flex>
      </ModalHeader>
      <ModalBody maxH="500px">
        <TableContainer overflowY={'auto'}>
          <Table fontSize={'sm'} overflow={'unset'}>
            <Thead>
              <Tr bgColor={'white !important'}>
                <Th borderLeftRadius="6px" bgColor="myGray.100">
                  {t('account_team:invitation_link_description')}
                </Th>
                <Th bgColor="myGray.100">{t('account_team:expires')}</Th>
                <Th bgColor="myGray.100">{t('account_team:used_times_limit')}</Th>
                <Th bgColor="myGray.100">{t('account_team:invited')}</Th>
                <Th bgColor="myGray.100" borderRightRadius="6px">
                  {t('common:common.Action')}
                </Th>
              </Tr>
            </Thead>
            {!!invitationLinkList?.length && (
              <Tbody overflow={'unset'}>
                {invitationLinkList?.map((item) => {
                  const isForbidden = item.forbidden || new Date(item.expires) < new Date();
                  return (
                    <Tr key={item._id} overflow={'unset'}>
                      <Td maxW="200px" minW="100px">
                        {item.description}
                      </Td>
                      <Td>
                        {isForbidden ? (
                          <Tag colorSchema="gray">{t('account_team:has_forbidden')}</Tag>
                        ) : (
                          format(new Date(item.expires), 'yyyy-MM-dd HH:mm')
                        )}
                      </Td>
                      <Td>
                        {item.usedTimesLimit === -1
                          ? t('account_team:unlimited')
                          : item.usedTimesLimit}
                      </Td>
                      <Td>
                        <MyPopover
                          w="fit-content"
                          Trigger={
                            <Box
                              minW="100px"
                              borderRadius="md"
                              cursor="pointer"
                              _hover={{ bg: 'myGray.100' }}
                              p="1.5"
                              w="fit-content"
                            >
                              <AvatarGroup max={3} avatars={item.members.map((i) => i.avatar)} />
                            </Box>
                          }
                          trigger="click"
                          closeOnBlur={true}
                        >
                          {() => (
                            <Box py="4" maxH="200px" w="fit-content">
                              <Flex mx="4" justifyContent="center" alignItems={'center'}>
                                <Box>{t('account_team:has_invited')}</Box>
                                <Box
                                  ml="auto"
                                  bg="myGray.200"
                                  px="2"
                                  borderRadius="md"
                                  fontSize="sm"
                                >
                                  {item.members.length}
                                </Box>
                              </Flex>
                              <Divider my="2" mx="4" />
                              <Grid
                                w="fit-content"
                                mt="2"
                                gridRowGap="4"
                                gridTemplateColumns="1fr 1fr"
                                overflow="auto"
                                alignItems="center"
                                mx="4"
                              >
                                {item.members.map((member) => (
                                  <Box key={member.tmbId} justifySelf="start">
                                    <MemberTag name={member.name} avatar={member.avatar} />
                                  </Box>
                                ))}
                              </Grid>
                            </Box>
                          )}
                        </MyPopover>
                      </Td>
                      <Td>
                        {!isForbidden && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onCopy(item._id)}
                              color="myGray.900"
                            >
                              <Icon name="common/link" w="16px" mr="1" />
                              {t('account_team:copy_link')}
                            </Button>
                            <MyPopover
                              placement="bottom-end"
                              Trigger={
                                <Button variant="outline" ml="10px" size="sm" color="myGray.900">
                                  <Icon name="common/lineStop" w="16px" mr="1" />
                                  {t('account_team:forbidden')}
                                </Button>
                              }
                              closeOnBlur={true}
                            >
                              {({ onClose: onClosePopover }) => (
                                <Box p={4}>
                                  <Box fontWeight={400} whiteSpace="pre-wrap">
                                    {t('account_team:forbid_hint')}
                                  </Box>
                                  <Flex gap={2} mt={2} justifyContent={'flex-end'}>
                                    <Button variant="outline" onClick={onClosePopover}>
                                      {t('common:common.Cancel')}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      colorScheme="red"
                                      onClick={() => {
                                        onForbid(item._id);
                                        onClosePopover();
                                      }}
                                    >
                                      {t('account_team:confirm_forbidden')}
                                    </Button>
                                  </Flex>
                                </Box>
                              )}
                            </MyPopover>
                          </>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            )}
          </Table>
          {!invitationLinkList?.length && <EmptyTip />}
        </TableContainer>
      </ModalBody>
      <ModalFooter justifyContent={'flex-start'}>
        <Tag colorSchema="blue" marginBlock="2">
          <Box>{t('account_team:invitation_link_auto_clean_hint')}</Box>
        </Tag>
      </ModalFooter>
      {isOpenCreate && (
        <CreateInvitationModal
          onClose={() => Promise.all([onCloseCreate(), refetchInvitationLinkList()])}
        />
      )}
    </MyModal>
  );
};

export default InviteModal;
