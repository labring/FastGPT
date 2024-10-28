import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import DefaultPermissionList from '@/components/support/permission/DefaultPerList';
import CollaboratorContextProvider, {
  MemberManagerInputPropsType
} from '../../support/permission/MemberManager/context';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ResumeInherit from '@/components/support/permission/ResumeInheritText';

const FolderSlideCard = ({
  refreshDeps,
  name,
  intro,
  onEdit,
  onMove,
  deleteTip,
  onDelete,

  defaultPer,
  managePer,
  isInheritPermission,
  resumeInheritPermission,
  hasParent,
  refetchResource
}: {
  refreshDeps?: any[];
  name: string;
  intro?: string;
  onEdit: () => void;
  onMove: () => void;
  deleteTip: string;
  onDelete: () => void;

  defaultPer?: {
    value: PermissionValueType;
    defaultValue: PermissionValueType;
    onChange: (v: PermissionValueType) => Promise<any>;
  };
  managePer: MemberManagerInputPropsType;

  isInheritPermission?: boolean;
  resumeInheritPermission?: () => Promise<void>;
  hasParent?: boolean;
  refetchResource?: () => Promise<any>;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: deleteTip
  });

  return (
    <Box w={'13rem'}>
      <Box>
        <HStack>
          <MyIcon name={FolderIcon} w={'1.5rem'} />
          <Box color={'myGray.900'}>{name}</Box>
          <MyIcon
            name={'edit'}
            _hover={{ color: 'primary.600' }}
            w={'0.875rem'}
            cursor={'pointer'}
            onClick={onEdit}
          />
        </HStack>
        <Box mt={3} fontSize={'sm'} color={'myGray.500'} cursor={'pointer'} onClick={onEdit}>
          {intro || t('common:not_yet_introduced')}
        </Box>
      </Box>

      {managePer.permission.hasManagePer && (
        <>
          <MyDivider my={6} />

          <Box>
            <FormLabel>{t('common:common.Operation')}</FormLabel>

            <Button
              variant={'transparentBase'}
              pl={1}
              leftIcon={<MyIcon name={'common/file/move'} w={'1rem'} />}
              transform={'none !important'}
              w={'100%'}
              justifyContent={'flex-start'}
              size={'sm'}
              fontSize={'mini'}
              mt={4}
              onClick={onMove}
            >
              {t('common:common.Move')}
            </Button>
            {managePer.permission.isOwner && (
              <Button
                variant={'transparentDanger'}
                pl={1}
                leftIcon={<MyIcon name={'delete'} w={'1rem'} />}
                transform={'none !important'}
                w={'100%'}
                justifyContent={'flex-start'}
                size={'sm'}
                fontSize={'mini'}
                mt={3}
                onClick={() => {
                  openConfirm(onDelete)();
                }}
              >
                {t('common:common.Delete folder')}
              </Button>
            )}
          </Box>
        </>
      )}

      {feConfigs?.isPlus && (
        <>
          <MyDivider my={6} />

          <Box>
            {!isInheritPermission && (
              <Box mt={2}>
                <ResumeInherit onResume={() => resumeInheritPermission?.().then(refetchResource)} />
              </Box>
            )}
            <Box mt={6}>
              <CollaboratorContextProvider
                {...managePer}
                refreshDeps={refreshDeps}
                refetchResource={refetchResource}
                isInheritPermission={isInheritPermission}
                hasParent={hasParent}
              >
                {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
                  return (
                    <>
                      <Flex alignItems="center" justifyContent="space-between">
                        <Box fontSize={'sm'} color={'myGray.500'}>
                          {t('common:permission.Collaborator')}
                        </Box>
                        {managePer.permission.hasManagePer && (
                          <HStack spacing={3}>
                            <MyTooltip label={t('common:permission.Manage')}>
                              <MyIcon
                                w="1rem"
                                name="common/settingLight"
                                cursor={'pointer'}
                                _hover={{ color: 'primary.600' }}
                                onClick={onOpenManageModal}
                              />
                            </MyTooltip>
                            <MyTooltip label={t('common:common.Add')}>
                              <MyIcon
                                w="1rem"
                                name="support/permission/collaborator"
                                cursor={'pointer'}
                                _hover={{ color: 'primary.600' }}
                                onClick={onOpenAddMember}
                              />
                            </MyTooltip>
                          </HStack>
                        )}
                      </Flex>
                      <MemberListCard
                        mt={2}
                        tagStyle={{
                          type: 'fill',
                          colorSchema: 'white'
                        }}
                      />
                    </>
                  );
                }}
              </CollaboratorContextProvider>
            </Box>
          </Box>
        </>
      )}

      <ConfirmModal />
    </Box>
  );
};

export default FolderSlideCard;
