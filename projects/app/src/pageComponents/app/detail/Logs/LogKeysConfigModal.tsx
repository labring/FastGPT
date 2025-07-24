import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import type { LogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { LogKeysEnumMap } from '@fastgpt/global/core/app/logs/constants';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { type updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { updateLogKeys } from '@/web/core/app/api/log';
import type { getLogKeysResponse } from '@/pages/api/core/app/logs/getLogKeys';

const LogKeysConfigModal = ({
  onClose,
  logKeysList,
  fetchLogKeys
}: {
  onClose: () => void;
  logKeysList: {
    key: LogKeysEnum;
    enable: boolean;
  }[];
  fetchLogKeys: () => Promise<getLogKeysResponse>;
}) => {
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const { t } = useTranslation();
  const { runAsync: updateList, loading: updateLoading } = useRequest2(
    async (data: updateLogKeysBody) => {
      await updateLogKeys(data);
    },
    {
      manual: true,
      onSuccess: async () => {
        await fetchLogKeys();
        onClose();
      }
    }
  );

  const [logKeys, setLogKeys] = useState<{ key: LogKeysEnum; enable: boolean }[]>(logKeysList);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc={'common/setting'}
      iconColor={'primary.600'}
      title={t('app:logs_key_config')}
      isLoading={updateLoading}
    >
      <ModalBody px={9} py={6} w={'450px'}>
        <DndDrag<{ key: LogKeysEnum; enable: boolean }>
          onDragEndCb={(list) => {
            setLogKeys(list);
          }}
          dataList={logKeys}
          renderClone={(provided, snapshot, rubric) => (
            <DragItem
              item={logKeys[rubric.source.index]}
              provided={provided}
              snapshot={snapshot}
              logKeys={logKeys}
              setLogKeys={setLogKeys}
            />
          )}
        >
          {({ provided }) => (
            <Box {...provided.droppableProps} ref={provided.innerRef}>
              {logKeys.map((item, index) => (
                <Draggable key={item.key} draggableId={item.key} index={index}>
                  {(provided, snapshot) => (
                    <>
                      <DragItem
                        item={item}
                        provided={provided}
                        snapshot={snapshot}
                        logKeys={logKeys}
                        setLogKeys={setLogKeys}
                      />
                      {index !== logKeys.length - 1 && <Box h={'1px'} bg={'myGray.200'} />}
                    </>
                  )}
                </Draggable>
              ))}
            </Box>
          )}
        </DndDrag>
      </ModalBody>
      <ModalFooter pt={0} pb={6} px={9}>
        <Button onClick={onClose} variant={'outline'} mr={3}>
          {t('common:Close')}
        </Button>
        <Button
          onClick={async () => {
            await updateList({
              appId,
              logKeys
            });
          }}
        >
          {t('common:Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default LogKeysConfigModal;

const DragItem = ({
  item,
  provided,
  snapshot,
  logKeys,
  setLogKeys
}: {
  item: { key: LogKeysEnum; enable: boolean };
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  logKeys: { key: LogKeysEnum; enable: boolean }[];
  setLogKeys: (logKeys: { key: LogKeysEnum; enable: boolean }[]) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      alignItems={'center'}
      py={1}
    >
      <Box {...provided.dragHandleProps}>
        <MyIcon
          name={'drag'}
          p={2}
          borderRadius={'md'}
          _hover={{ color: 'primary.600' }}
          w={'12px'}
          color={'myGray.600'}
        />
      </Box>
      <Box fontSize={'14px'} color={'myGray.900'}>
        {t(LogKeysEnumMap[item.key])}
      </Box>
      <Box flex={1} />
      {item.enable ? (
        <MyIcon
          name={'visible'}
          borderRadius={'md'}
          w={4}
          p={1}
          cursor={'pointer'}
          color={'primary.600'}
          _hover={{ bg: 'myGray.50' }}
          onClick={() => {
            setLogKeys(
              logKeys.map((key) => (key.key === item.key ? { ...key, enable: false } : key))
            );
          }}
        />
      ) : (
        <MyIcon
          name={'invisible'}
          borderRadius={'md'}
          w={4}
          p={1}
          cursor={'pointer'}
          _hover={{ bg: 'myGray.50' }}
          onClick={() => {
            setLogKeys(
              logKeys.map((key) => (key.key === item.key ? { ...key, enable: true } : key))
            );
          }}
        />
      )}
    </Flex>
  );
};
