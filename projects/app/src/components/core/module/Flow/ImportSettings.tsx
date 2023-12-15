import React, { useState } from 'react';
import { Textarea, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@/web/common/hooks/useToast';
import { useFlowProviderStore, type useFlowProviderStoreType } from './FlowProvider';

type Props = {
  onClose: () => void;
};

const ImportSettings = ({
  onClose,
  setNodes,
  setEdges,
  initData
}: Props & {
  setNodes: useFlowProviderStoreType['setNodes'];
  setEdges: useFlowProviderStoreType['setEdges'];
  initData: useFlowProviderStoreType['initData'];
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = useState('');

  return (
    <MyModal
      isOpen
      w={'600px'}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('app.Import Configs')}
    >
      <ModalBody>
        <Textarea
          placeholder={t('app.Paste Config') || 'app.Paste Config'}
          defaultValue={value}
          rows={16}
          onChange={(e) => setValue(e.target.value)}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="base"
          onClick={() => {
            if (!value) {
              return onClose();
            }
            try {
              const data = JSON.parse(value);
              setEdges([]);
              setNodes([]);
              setTimeout(() => {
                initData(data);
              }, 10);
              onClose();
            } catch (error) {
              toast({
                title: t('app.Import Configs Failed')
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

export default React.memo(function (props: Props) {
  const { setNodes, setEdges, initData } = useFlowProviderStore();

  return <ImportSettings {...props} setNodes={setNodes} setEdges={setEdges} initData={initData} />;
});
