import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button } from '@chakra-ui/react';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import LightTip from '@fastgpt/web/components/common/LightTip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import SelectOneResource, {
  type SelectOneResourceItemType,
  type SelectOneResourceServer
} from './SelectOneResource';

const rootId = 'root';

type Props = {
  moveResourceId: string;
  title: string;
  server: SelectOneResourceServer;
  onConfirm: (id: ParentIdType) => Promise<any>;
  onClose: () => void;
  moveHint?: string;
};

const MoveModal = ({ moveResourceId, title, server, onConfirm, onClose, moveHint }: Props) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<ParentIdType>();
  const [isAtRoot, setIsAtRoot] = useState(true);
  const hasSelection = selectedId !== undefined;

  const onSelect = (item?: SelectOneResourceItemType) => {
    if (!item) {
      setSelectedId(undefined);
      return;
    }
    setSelectedId(item.id === rootId ? null : item.id);
  };

  const { runAsync: onConfirmMove, loading: confirming } = useRequest(
    (parentId: ParentIdType) => {
      if (parentId === undefined) return Promise.reject('');
      return onConfirm(parentId);
    },
    {
      onSuccess: onClose,
      successToast: t('common:move_success')
    }
  );

  return (
    <MyModal
      isOpen
      size={'md'}
      title={title}
      onClose={onClose}
      isCentered
      bodyStyles={{
        flex: '1 0 0',
        minH: '400px'
      }}
      footer={
        <>
          {isAtRoot && (
            <Button variant={'primary'} isLoading={confirming} onClick={() => onConfirmMove(null)}>
              {t('common:move_to_root')}
            </Button>
          )}
          <Box flex={1} />
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={confirming}
            isDisabled={!hasSelection}
            onClick={() => onConfirmMove(selectedId)}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      {moveHint && (
        <Box mb={3}>
          <LightTip text={moveHint} />
        </Box>
      )}
      <Box
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'md'}
        p={3}
        flex={'1 0 0'}
        minH={0}
        overflow={'hidden'}
      >
        <SelectOneResource
          server={server}
          value={selectedId}
          onSelect={onSelect}
          onCurrentParentIdChange={(parentId) => setIsAtRoot(parentId === null)}
          selectFolder
          disabledIds={[moveResourceId]}
          maxH={'100%'}
        />
      </Box>
    </MyModal>
  );
};

export default MoveModal;
