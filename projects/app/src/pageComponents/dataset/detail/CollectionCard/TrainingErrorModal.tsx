import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { useTranslation } from 'next-i18next';
import TrainingErrorList from './TrainingErrorList';

const TrainingErrorModal = ({
  datasetId,
  permission,
  onClose,
  onRefresh
}: {
  datasetId: string;
  permission: DatasetItemType['permission'];
  onClose: () => void;
  onRefresh?: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('dataset:training_error_list')}
      size={'lg'}
      isCentered
      borderRadius={'10px'}
      sx={{
        '.chakra-modal__close-btn': {
          top: '8px',
          right: '8px',
          w: '36px',
          h: '36px'
        }
      }}
    >
      <TrainingErrorList
        scope={{ type: 'dataset', datasetId }}
        permission={permission}
        onClose={onClose}
        onRefresh={onRefresh}
        showFooter
      />
    </MyModal>
  );
};

export default TrainingErrorModal;
