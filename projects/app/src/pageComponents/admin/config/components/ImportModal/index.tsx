import type { ConfigFormType } from '@/pageComponents/admin/config/type';
import { formatConfigStore2FormSchema } from '@/web/admin/config/adapt';
import { Button, useDisclosure } from '@chakra-ui/react';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import React, { useEffect } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';

export default function ImportModal(props: {
  children: React.ReactElement;
  value: any;
  setFormData: any;
  setRawData: any;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { children, value, setFormData, setRawData } = props;
  const [configData, setConfigData] = React.useState<string>('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 迁移自 pro/admin，保持原逻辑
    setConfigData(JSON.stringify(value, null, 2));
  }, [value]);

  const { toast } = useToast();

  return (
    <>
      {children &&
        React.cloneElement(children, {
          onClick: (e: any) => {
            e.stopPropagation();
            onOpen();
          }
        })}

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title="导入配置"
        size="xl"
        maxW="90vw"
        footer={
          <>
            <Button variant="whiteBase" onClick={onClose} w={40}>
              取消
            </Button>
            <Button
              colorScheme="blue"
              w={40}
              onClick={() => {
                try {
                  setRawData(JSON.parse(configData));
                  const aggregatedConfigs: ConfigFormType = formatConfigStore2FormSchema(
                    JSON.parse(configData)
                  );
                  setFormData(aggregatedConfigs);
                  onClose();
                  toast({
                    title: '导入成功，请点击保存',
                    status: 'success'
                  });
                } catch (error: any) {
                  toast({
                    title: '请检查配置文件格式',
                    description: error.message,
                    status: 'error'
                  });
                }
              }}
            >
              导入
            </Button>
          </>
        }
      >
        <JsonEditor
          height={500}
          value={JSON.stringify(value, null, 2)}
          onChange={(value) => {
            setConfigData(value);
          }}
        />
      </MyModal>
    </>
  );
}
