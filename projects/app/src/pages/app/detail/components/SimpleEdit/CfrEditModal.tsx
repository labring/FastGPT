import React, { useMemo, useState } from 'react';

import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import PromptTextarea from '@/components/common/Textarea/PromptTextarea';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';

const CfrEditModal = ({
  defaultValue = '',
  onClose,
  onFinish
}: {
  defaultValue?: string;
  onClose: () => void;
  onFinish: (value: string) => void;
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/module/cfr.svg"
      w={'500px'}
      title={t('core.module.template.cfr')}
    >
      <ModalBody>
        {t('core.app.edit.cfr background prompt')}
        <MyTooltip label={t('core.app.edit.cfr background tip')} forceShow>
          <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
        </MyTooltip>
        <PromptTextarea
          mt={1}
          flex={1}
          bg={'myWhite.400'}
          rows={5}
          placeholder={t('core.module.input.placeholder.cfr background')}
          defaultValue={value}
          onBlur={(e) => {
            setValue(e.target.value || '');
          }}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          onClick={() => {
            onFinish(value);
            onClose();
          }}
        >
          {t('common.Done')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CfrEditModal);
