import React, { useCallback, useState } from 'react';
import { ModalBody, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import type { SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import { useTranslation } from 'next-i18next';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const SelectAppModal = ({
  value,
  filterAppIds = [],
  onClose,
  onSuccess
}: {
  value?: SelectAppItemType;
  filterAppIds?: string[];
  onClose: () => void;
  onSuccess: (e: SelectAppItemType) => void;
}) => {
  const { t } = useTranslation();
  const [selectedApp, setSelectedApp] = useState<SelectAppItemType | undefined>(value);

  const getAppList = useCallback(
    async ({ parentId }: GetResourceFolderListProps) => {
      return getMyApps({
        parentId,
        type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
      }).then((res) =>
        res
          .filter((item) => !filterAppIds.includes(item._id))
          .map<GetResourceListItemResponse>((item) => ({
            id: item._id,
            name: item.name,
            avatar: item.avatar,
            isFolder: item.type === AppTypeEnum.folder
          }))
      );
    },
    [filterAppIds]
  );

  return (
    <MyModal
      isOpen
      title={t('common:core.module.Select app')}
      iconSrc="/imgs/workflow/ai.svg"
      onClose={onClose}
      position={'relative'}
      w={'600px'}
    >
      <ModalBody flex={'1 0 0'} overflow={'auto'} minH={'400px'} position={'relative'}>
        <SelectOneResource
          value={selectedApp?.id}
          onSelect={(id) => setSelectedApp(id ? { id } : undefined)}
          server={getAppList}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button
          ml={2}
          isDisabled={!selectedApp}
          onClick={() => {
            if (!selectedApp) return;
            onSuccess(selectedApp);
            onClose();
          }}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(SelectAppModal);
