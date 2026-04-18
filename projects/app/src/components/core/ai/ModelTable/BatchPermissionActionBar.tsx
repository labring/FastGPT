import { Button } from '@chakra-ui/react';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { updateModelCollaborators } from '@/web/common/system/api';
import type { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import type { I18nT, ModelRow, TeamPermission } from './types';

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
  return (
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
          onUpdateCollaborators={({ collaborators }) =>
            updateModelCollaborators({
              collaborators,
              models: selectedItems.map((i) => i.model)
            })
          }
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
  );
};

export default BatchPermissionActionBar;
