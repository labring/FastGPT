import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useRouter } from 'next/router';
import { TabEnum } from '../../../../../pages/dataset/detail';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';

const FileModeSelector = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState<ImportDataSourceEnum>(ImportDataSourceEnum.fileLocal);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('common:core.dataset.import.Select source')}
      size="md"
      footer={
        <Button
          onClick={() =>
            router.replace({
              query: {
                ...router.query,
                currentTab: TabEnum.import,
                source: value
              }
            })
          }
        >
          {t('common:Confirm')}
        </Button>
      }
    >
      <LeftRadio
        list={[
          {
            title: t('common:core.dataset.import.Local file'),
            desc: t('common:core.dataset.import.Local file desc'),
            value: ImportDataSourceEnum.fileLocal
          },
          {
            title: t('common:core.dataset.import.Web link'),
            desc: t('common:core.dataset.import.Web link desc'),
            value: ImportDataSourceEnum.fileLink
          },
          {
            title: t('common:core.dataset.import.Custom text'),
            desc: t('common:core.dataset.import.Custom text desc'),
            value: ImportDataSourceEnum.fileCustom
          }
        ]}
        value={value}
        onChange={setValue}
      />
    </MyModal>
  );
};

export default FileModeSelector;
