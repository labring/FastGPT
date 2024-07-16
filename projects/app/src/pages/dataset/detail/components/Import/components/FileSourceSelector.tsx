import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { ModalBody, ModalFooter, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useRouter } from 'next/router';
import { TabEnum } from '../../..';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';

const FileModeSelector = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState<ImportDataSourceEnum>(ImportDataSourceEnum.fileLocal);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/selectSource"
      title={t('common:core.dataset.import.Select source')}
      w={'600px'}
    >
      <ModalBody px={6} py={4}>
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
      </ModalBody>
      <ModalFooter>
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
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FileModeSelector;
