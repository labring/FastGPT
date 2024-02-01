import React, { useCallback, useState, useTransition } from 'react';

import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
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
        <Box mt={1} flex={1}>
          <PromptEditor
            h={200}
            showOpenModal={false}
            placeholder={t('core.module.input.placeholder.cfr background')}
            value={value}
            onChange={(e) => {
              setValue(e);
            }}
          />
        </Box>
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
