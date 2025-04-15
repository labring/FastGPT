import { Box, Flex } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import React from 'react';
import styles from '../SimpleApp/styles.module.scss';
import { cardStyles } from '../constants';
import AppCard from './AppCard';
import ChatTest from './ChatTest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EditForm from './EditForm';
import { ToolType } from '@fastgpt/global/core/app/type';

const Edit = ({
  url,
  setUrl,
  toolList,
  setToolList,
  currentTool,
  setCurrentTool
}: {
  url: string;
  setUrl: (url: string) => void;
  toolList: ToolType[];
  setToolList: (toolList: ToolType[]) => void;
  currentTool: ToolType | null;
  setCurrentTool: (tool: ToolType) => void;
}) => {
  const { isPc } = useSystem();
  // const { t } = useTranslation();
  // const [currentToolId, setCurrentToolId] = useState<string | null>(null);
  // const [currentTool, setCurrentTool] = useState<AppDetailType | null>(null);
  // const { data: tools = [], loading: isFetchingApps } = useRequest2(
  //   () => {
  //     return getMyApps({ parentId: appDetail._id });
  //   },
  //   {
  //     manual: false,
  //     refreshDeps: [appDetail._id],
  //     throttleWait: 500,
  //     onSuccess: (res) => {
  //       setCurrentToolId(res[0]?._id || null);
  //     }
  //   }
  // );

  // const { loading: loadingApp, runAsync: reloadApp } = useRequest2(
  //   () => {
  //     if (currentToolId) {
  //       return getAppDetailById(currentToolId);
  //     }
  //     return Promise.resolve(defaultApp);
  //   },
  //   {
  //     manual: false,
  //     refreshDeps: [currentToolId],
  //     errorToast: t('common:core.app.error.Get app failed'),
  //     onSuccess: (res) => {
  //       setCurrentTool(res);
  //     }
  //   }
  // );

  return (
    <MyBox
      display={['block', 'flex']}
      flex={'1 0 0'}
      h={0}
      mt={[4, 0]}
      gap={1}
      borderRadius={'lg'}
      overflowY={['auto', 'unset']}
    >
      <Flex
        flexDirection={'column'}
        className={styles.EditAppBox}
        pr={[0, 1]}
        minW={['auto', '580px']}
        mb={3}
      >
        <Box {...cardStyles} boxShadow={'2'}>
          <AppCard />
        </Box>

        <Box mt={4} {...cardStyles} flex={'1 0 0'} overflow={'auto'} boxShadow={'2'}>
          <EditForm
            toolList={toolList}
            setToolList={setToolList}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            url={url}
            setUrl={setUrl}
          />
        </Box>
      </Flex>
      {isPc && (
        <Box flex={'2 0 0'} w={0} mb={3}>
          <ChatTest currentTool={currentTool} url={url} />
        </Box>
      )}
    </MyBox>
  );
};

export default React.memo(Edit);
