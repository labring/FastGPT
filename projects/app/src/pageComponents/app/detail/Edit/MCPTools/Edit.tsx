import { Box, Flex } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import React from 'react';
import styles from '../FormComponent/styles.module.scss';
import { cardStyles } from '../../constants';
import AppCard from './AppCard';
import ChatTest from './ChatTest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EditForm from './EditForm';
import { type McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { McpOAuthClientMode } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpToolSetOAuthConfigType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import type { McpOAuthStatusResponseType } from '@fastgpt/global/openapi/core/app/mcpTools/oauth';

const Edit = ({
  appId,
  nodeId,
  url,
  setUrl,
  toolList,
  setToolList,
  currentTool,
  setCurrentTool,
  headerSecret,
  setHeaderSecret,
  authMode,
  setAuthMode,
  clientMode,
  setClientMode,
  scope,
  setScope,
  oauthConfig,
  status,
  statusLoading,
  refreshStatus,
  callbackErrorCode,
  clearCallbackError,
  onBeforeStart,
  onBeforeParse
}: {
  appId: string;
  nodeId?: string;
  url: string;
  setUrl: (url: string) => void;
  toolList: McpToolConfigType[];
  setToolList: (toolList: McpToolConfigType[]) => void;
  currentTool?: McpToolConfigType;
  setCurrentTool: (tool: McpToolConfigType) => void;
  headerSecret: StoreSecretValueType;
  setHeaderSecret: (headerSecret: StoreSecretValueType) => void;
  authMode: 'headers' | 'oauth';
  setAuthMode: (mode: 'headers' | 'oauth') => void;
  clientMode: McpOAuthClientMode;
  setClientMode: (mode: McpOAuthClientMode) => void;
  scope: string;
  setScope: (scope: string) => void;
  oauthConfig?: McpToolSetOAuthConfigType;
  status: McpOAuthStatusResponseType | null;
  statusLoading: boolean;
  refreshStatus: () => Promise<McpOAuthStatusResponseType | undefined>;
  callbackErrorCode: string | null;
  clearCallbackError: () => void;
  onBeforeStart: () => Promise<void>;
  onBeforeParse: () => Promise<void>;
}) => {
  const { isPc } = useSystem();

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
        flex={'1 0 0'}
      >
        <Box {...cardStyles} boxShadow={'2'}>
          <AppCard />
        </Box>

        <Box mt={4} {...cardStyles} flex={'1 0 0'} overflow={'auto'} boxShadow={'2'}>
          <EditForm
            appId={appId}
            nodeId={nodeId}
            toolList={toolList}
            setToolList={setToolList}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            url={url}
            setUrl={setUrl}
            headerSecret={headerSecret}
            setHeaderSecret={setHeaderSecret}
            authMode={authMode}
            setAuthMode={setAuthMode}
            clientMode={clientMode}
            setClientMode={setClientMode}
            scope={scope}
            setScope={setScope}
            oauthConfig={oauthConfig}
            status={status}
            statusLoading={statusLoading}
            refreshStatus={refreshStatus}
            callbackErrorCode={callbackErrorCode}
            clearCallbackError={clearCallbackError}
            onBeforeStart={onBeforeStart}
            onBeforeParse={onBeforeParse}
          />
        </Box>
      </Flex>
      {isPc && (
        <Box flex={'2 0 0'} w={0} mb={3}>
          <ChatTest
            currentTool={currentTool}
            url={url}
            headerSecret={headerSecret}
            appId={appId}
            nodeId={nodeId}
            authMode={authMode}
          />
        </Box>
      )}
    </MyBox>
  );
};

export default React.memo(Edit);
