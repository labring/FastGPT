import React, { useState } from 'react';
import { Textarea, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { useI18n } from '@/web/context/I18n';

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { appT } = useI18n();
  const { toast } = useToast();
  const initData = useContextSelector(WorkflowContext, (v) => v.initData);
  const [value, setValue] = useState('');

  return (
    <MyModal
      isOpen
      w={'600px'}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={appT('Import Configs')}
    >
      <ModalBody>
        <Textarea
          placeholder={appT('Paste Config')}
          defaultValue={value}
          rows={16}
          onChange={(e) => setValue(e.target.value)}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="whiteBase"
          onClick={() => {
            if (!value) {
              return onClose();
            }
            try {
              const data = JSON.parse(value);
              initData(data);
              onClose();
            } catch (error) {
              toast({
                title: appT('Import Configs Failed')
              });
            }
          }}
        >
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ImportSettings);
