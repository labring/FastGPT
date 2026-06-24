import { Button } from '@chakra-ui/react';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { updateModelCollaborators } from '@/web/common/system/api';
import { clientInitData } from '@/web/common/system/staticData';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useState } from 'react';
import type { ModelReference } from '@fastgpt/service/support/permission/model/reference';
import type { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import type { I18nT, ModelRow, TeamPermission } from './types';
import ModelReferenceModal from './ModelReferenceModal';

export type BatchPermissionActionBarProps = {
  FloatingActionBar: ReturnType<typeof useTableMultipleSelect<ModelRow>>['FloatingActionBar'];
  selectedItems: ModelRow[];
  permission: TeamPermission;
  t: I18nT;
};

const BatchPermissionActionBar = ({
  FloatingActionBar,
  selectedItems,
  permission,
  t
}: BatchPermissionActionBarProps) => {
  const manageableItems = selectedItems.filter((item) => item.permission.hasManagePer);
  const { toast } = useToast();
  const [referenceDialog, setReferenceDialog] = useState<{
    isOpen: boolean;
    references: ModelReference[];
  }>({ isOpen: false, references: [] });

  const handleCollaboratorError = (references: ModelReference[]) => {
    setReferenceDialog({ isOpen: true, references });
  };

  if (manageableItems.length === 0) return null;

  return (
    <>
      <FloatingActionBar
        activedStyles={{
          borderRadius: 'md',
          boxShadow: 'md'
        }}
        Controler={
          <LazyCollaboratorProvider
            selectedHint={t('account_model:model_permission_config_hint')}
            defaultRole={ReadRoleVal}
            onGetCollaboratorList={() =>
              Promise.resolve({
                clbs: []
              })
            }
            onUpdateCollaborators={async ({ collaborators }) => {
              try {
                await updateModelCollaborators({
                  collaborators,
                  modelIds: manageableItems.map((i) => i.id)
                });
              } catch (err: any) {
                const refs = err?.data?.references;
                if (err?.code === 409 && refs?.length > 0) {
                  handleCollaboratorError(refs);
                  throw err;
                }
                if (err?.code === 409 && err?.message) {
                  toast({
                    title: t(err.message as any),
                    status: 'error'
                  });
                  return;
                }
                throw err;
              }
            }}
            refetchResource={() => clientInitData()}
            permission={permission}
          >
            {({ onOpenManageModal }) => (
              <Button variant={'whiteBase'} onClick={onOpenManageModal}>
                {t('common:permission.Permission config')}
              </Button>
            )}
          </LazyCollaboratorProvider>
        }
      ></FloatingActionBar>
      <ModelReferenceModal
        isOpen={referenceDialog.isOpen}
        references={referenceDialog.references}
        onClose={() => setReferenceDialog({ isOpen: false, references: [] })}
      />
    </>
  );
};

export default BatchPermissionActionBar;
