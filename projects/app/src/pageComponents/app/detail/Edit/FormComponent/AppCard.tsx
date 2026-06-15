import React, { useState, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  IconButton,
  HStack,
  ModalBody,
  Checkbox,
  ModalFooter
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import TagsEditModal from '../../TagsEditModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useContextSelector } from 'use-context-selector';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { changeOwner, resumeInheritPer } from '@/web/core/app/api';
import { postTransition2Workflow } from '@/web/core/app/api/app';
import type { SimpleAppSnapshotType } from './useSnapshots';
import ExportConfigPopover from '@/pageComponents/app/detail/ExportConfigPopover';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import type { Form2WorkflowFnType } from './type';

const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const AppCard = ({
  appForm,
  setPast,
  form2WorkflowFn,
  configToWorkflow = true
}: {
  appForm: AppFormEditFormType;
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
  form2WorkflowFn: Form2WorkflowFnType;
  configToWorkflow?: boolean;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);

  const appId = appDetail._id;
  const { feConfigs } = useSystemStore();
  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchemaType>();
  const [filterSensitiveInfo, setFilterSensitiveInfo] = useState(true);

  // permission
  const [editPerAppId, setEditPerAppId] = useState<string>();
  const editPerApp = useMemo(
    () => (editPerAppId !== undefined ? appDetail : undefined),
    [editPerAppId, appDetail]
  );
  const { runAsync: onResumeInheritPermission } = useRequest(
    () => {
      return resumeInheritPer(editPerApp!._id);
    },
    {
      manual: true,
      errorToast: t('common:permission.Resume InheritPermission Failed')
    }
  );

  // transition to workflow
  const [transitionCreateNew, setTransitionCreateNew] = useState<boolean>();
  const { runAsync: onTransition, loading: transiting } = useRequest(
    async () => {
      const { nodes, edges } = form2WorkflowFn(appForm, t);
      await onSaveApp({
        nodes,
        edges,
        chatConfig: appForm.chatConfig,
        isPublish: false,
        versionName: t('app:transition_to_workflow')
      });

      return postTransition2Workflow({ appId, createNew: transitionCreateNew });
    },
    {
      onSuccess: ({ id }) => {
        if (id) {
          router.replace({
            query: {
              appId: id
            }
          });
        } else {
          setPast([]);
          router.reload();
        }
      },
      successToast: t('common:Success')
    }
  );

  return (
    <>
      {/* basic info */}
      <Box p={'24px'} position={'relative'}>
        {/* Header: Avatar, Name and Action Icons */}
        <Flex alignItems={'center'} justifyContent={'space-between'} mb={4}>
          <Flex alignItems={'center'} flex={1} minW={0} h="32px">
            <Avatar src={appDetail.avatar} borderRadius={'md'} w={'32px'} h={'32px'} />
            <Box
              ml={3}
              fontWeight={'500'}
              fontSize={'16'}
              lineHeight={'24px'}
              color={'myGray.550'}
              flex={1}
              noOfLines={1}
            >
              {appDetail.name}
            </Box>
          </Flex>

          {/* Right Action Icons */}
          <HStack spacing={2} ml={4}>
            {appDetail.permission.hasManagePer && (
              <MyTooltip label={t('app:app_detail_edit')}>
                <IconButton
                  variant={'whitePrimary'}
                  size={'mdSquare'}
                  icon={<MyIcon name={'edit'} w={'16px'} />}
                  aria-label={'edit'}
                  onClick={onOpenInfoEdit}
                />
              </MyTooltip>
            )}
            <MyTooltip label={t('app:app_detail_chat')}>
              <IconButton
                variant={'whitePrimary'}
                w="32px"
                h="32px"
                icon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
                aria-label={'chat'}
                onClick={() =>
                  router.push(`/chat?appId=${appId}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`)
                }
              />
            </MyTooltip>
            {appDetail.permission.hasManagePer && (
              <MyTooltip label={t('app:app_detail_permission')}>
                <IconButton
                  size={['smSquare', 'mdSquare']}
                  variant={'whitePrimary'}
                  icon={<MyIcon name={'key'} w={'16px'} />}
                  aria-label={'permission'}
                  onClick={() => setEditPerAppId(appDetail._id)}
                />
              </MyTooltip>
            )}
            {appDetail.permission.isOwner && configToWorkflow && (
              <MyMenu
                size={'xs'}
                Button={
                  <IconButton
                    variant={'whitePrimary'}
                    size={'mdSquare'}
                    icon={<MyIcon name={'more'} w={'16px'} />}
                    aria-label={'more'}
                  />
                }
                menuList={[
                  {
                    children: [
                      {
                        label: (
                          <Flex>
                            <ExportConfigPopover
                              appName={appDetail.name}
                              appIntro={appDetail.intro}
                              appForm={appForm}
                              chatConfig={appDetail.chatConfig}
                              filterSensitiveInfo={filterSensitiveInfo}
                              onFilterSensitiveInfoChange={setFilterSensitiveInfo}
                            />
                          </Flex>
                        )
                      },
                      {
                        icon: 'core/app/type/workflow',
                        label: t('app:transition_to_workflow'),
                        onClick: () => setTransitionCreateNew(true)
                      },
                      ...(appDetail.permission.hasWritePer && feConfigs?.show_team_chat
                        ? [
                            {
                              icon: 'core/chat/fileSelect',
                              label: t('app:team_tags_set'),
                              onClick: () => setTeamTagsSet(appDetail)
                            }
                          ]
                        : [])
                    ]
                  }
                ]}
              />
            )}
          </HStack>
        </Flex>

        {/* Intro Text */}
        <Box
          className={'textEllipsis2'}
          wordBreak={'break-all'}
          color={'#667085'}
          fontSize={'12px'}
          lineHeight={'16px'}
          height={'32px'}
        >
          {appDetail.intro || t('common:core.app.tip.Add a intro to app')}
        </Box>
      </Box>
      {TeamTagsSet && <TagsEditModal onClose={() => setTeamTagsSet(undefined)} />}
      {!!editPerApp && (
        <ConfigPerModal
          {...(editPerApp.permission.isOwner && {
            onChangeOwner: (tmbId: string) =>
              changeOwner({
                appId: editPerApp._id,
                ownerId: tmbId
              })
          })}
          hasParent={false}
          resumeInheritPermission={onResumeInheritPermission}
          isInheritPermission={editPerApp.inheritPermission}
          avatar={editPerApp.avatar}
          name={editPerApp.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            roleList: AppRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            onDelOneCollaborator: async (
              props: RequireOnlyOne<{
                tmbId?: string;
                groupId?: string;
                orgId?: string;
              }>
            ) =>
              deleteAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            refreshDeps: [editPerApp.inheritPermission]
          }}
          onClose={() => setEditPerAppId(undefined)}
        />
      )}
      {transitionCreateNew !== undefined && (
        <MyModal isOpen title={t('app:transition_to_workflow')} iconSrc="core/app/type/workflow">
          <ModalBody>
            <Box mb={3}>{t('app:transition_to_workflow_create_new_tip')}</Box>
            <HStack cursor={'pointer'} onClick={() => setTransitionCreateNew((state) => !state)}>
              <Checkbox
                isChecked={transitionCreateNew}
                icon={<MyIcon name={'common/check'} w={'12px'} />}
              />
              <Box>{t('app:transition_to_workflow_create_new_placeholder')}</Box>
            </HStack>
          </ModalBody>
          <ModalFooter>
            <Button variant={'whiteBase'} onClick={() => setTransitionCreateNew(undefined)} mr={3}>
              {t('common:Close')}
            </Button>
            <Button variant={'dangerFill'} isLoading={transiting} onClick={() => onTransition()}>
              {t('common:Confirm')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(AppCard);
