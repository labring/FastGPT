import React, { useCallback, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  ModalCloseButton,
  ModalBody,
  Box,
  ModalFooter,
  Button,
  HStack,
  Flex,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Grid,
  Divider
} from '@chakra-ui/react';
import TagTextarea from '@/components/common/Textarea/TagTextarea';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { InviteMemberResponse } from '@fastgpt/global/support/user/team/controller.d';
import { getInvitationLinkList, putUpdateInvitationInfo } from '@/web/support/user/team/api';
import { InvitationType } from '@fastgpt/service/support/user/team/invitationLink/type';
import Icon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import format from 'date-fns/format';
import MemberTag from '@/components/support/user/team/Info/MemberTag';
import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Tag from '@fastgpt/web/components/common/Tag';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

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
      <ModalBody>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <HStack>
            <Icon name="common/list" color="primary.600" w="16px" />
            <Box ml={1}>{t('account_team:invitation_link_list')}</Box>
          </HStack>
          <Button onClick={onOpenCreate}>{t('account_team:create_invitation_link')}</Button>
        </Flex>
        <Table mt="2">
          <Thead>
            <Tr>
              <Th>{t('account_team:invitation_link_description')}</Th>
              <Th>{t('account_team:expires')}</Th>
              <Th>{t('account_team:used_times_limit')}</Th>
              <Th>{t('account_team:invited')}</Th>
              <Th>{t('common:common.Action')}</Th>
            </Tr>
          </Thead>
          {!!invitationLinkList?.length && (
            <Tbody>
              {invitationLinkList?.map((item) => {
                const isForbidden = item.forbidden || new Date(item.expires) < new Date();
                return (
                  <Tr key={item._id}>
                    <Td>{item.description}</Td>
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
                        Trigger={
                          <Box cursor="pointer">
                            <AvatarGroup max={3} avatars={item.members.map((i) => i.avatar)} />
                          </Box>
                        }
                        trigger="click"
                        closeOnBlur={true}
                      >
                        {() => (
                          <Box py="4" maxH="200px">
                            <Flex mx="8" justifyContent="center" alignItems={'center'}>
                              <Box>{t('account_team:has_invited')}</Box>
                              <Box
                                ml="auto"
                                bg="myGray.200"
                                px="2"
                                py="1"
                                borderRadius="md"
                                fontSize="sm"
                              >
                                {item.members.length}
                              </Box>
                            </Flex>
                            <Divider my="2" mx="8" />
                            <Grid
                              mt="2"
                              gridRowGap="4"
                              gridTemplateColumns="1fr 1fr"
                              overflow="auto"
                              alignItems="center"
                            >
                              {item.members.map((member) => (
                                <Box key={member.tmbId} justifySelf="center" alignSelf="center">
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
                          <Button size="sm" variant="outline" onClick={() => onCopy(item._id)}>
                            <Icon name="common/link" w="16px" mr="1" />
                            {t('account_team:copy_link')}
                          </Button>
                          <MyPopover
                            Trigger={
                              <Button variant="outline" ml="1" size="sm">
                                <Icon name="common/lineStop" w="16px" mr="1" />
                                {t('account_team:forbidden')}
                              </Button>
                            }
                            closeOnBlur={true}
                          >
                            {({ onClose: onClosePopover }) => (
                              <Box p={4}>
                                <Box fontWeight={400}>{t('account_team:forbid_hint')} </Box>
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
      </ModalBody>
      <ModalFooter justifyContent={'flex-start'}>
        <Tag colorSchema="blue">
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
