import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { importWorkflowFromUrl, fetchWorkflowFromUrl } from '@/web/core/app/workflow';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Flex,
  Spinner,
  Text,
  useToast,
  Button
} from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import ImportAppConfigEditor from '@/pageComponents/app/ImportAppConfigEditor';

const WorkflowImporter = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { userInfo } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [showJsonImporter, setShowJsonImporter] = useState(false);
  const [defaultJson, setDefaultJson] = useState('');
  const [workflowUrl, setWorkflowUrl] = useState('');

  useEffect(() => {
    // 添加浏览器环境检查
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return; // 如果不是浏览器环境，直接返回

    // 只有用户已登录时检查
    if (!userInfo?.username) {
      return;
    }

    const checkWorkflow = async () => {
      try {
        let url = sessionStorage.getItem('utm_workflow');

        if (!url) {
          return;
        }

        // 保存URL，等待导入完成后再移除
        setWorkflowUrl(url);
        setIsLoading(true);
        setStatus('正在获取工作流数据...');

        try {
          // 获取工作流数据
          const workflowData = await fetchWorkflowFromUrl(url);

          if (!workflowData) {
            throw new Error('无法获取工作流数据');
          }

          // 将获取到的JSON数据设置为defaultJson
          setDefaultJson(JSON.stringify(workflowData, null, 2));

          // 显示JSON导入窗口
          setIsLoading(false);
          setShowJsonImporter(true);
        } catch (error) {
          console.error('获取工作流数据失败:', error);
          setStatus(`获取失败：${error instanceof Error ? error.message : '未知错误'}`);

          toast({
            title: '获取工作流数据失败',
            description: error instanceof Error ? error.message : '未知错误',
            status: 'error',
            duration: 5000,
            isClosable: true
          });

          setTimeout(() => {
            setIsLoading(false);
          }, 2000);
        }
      } catch (error) {
        console.error('检查工作流URL出错:', error);
        setIsLoading(false);
      }
    };

    checkWorkflow();
  }, [userInfo, toast]);

  // 处理导入工作流
  const handleImportWorkflow = async (jsonConfig: string) => {
    try {
      setShowJsonImporter(false);
      setIsLoading(true);
      setStatus('正在导入工作流...');

      // 获取utm_params中的source参数，如果有的话
      let content = '未命名';
      try {
        const utmParams = localStorage.getItem('utm_params');
        if (utmParams) {
          const params = JSON.parse(utmParams);
          if (params.content) content = params.content;
        }
      } catch (error) {
        console.error('解析utm_params出错:', error);
      }

      // 解析JSON
      let workflowData;
      try {
        workflowData = JSON.parse(jsonConfig);
      } catch (e) {
        throw new Error('JSON格式无效，请检查配置');
      }

      // 创建应用
      const appId = await importWorkflowFromUrl({
        url: workflowUrl,
        name: `${content}`,
        data: workflowData // 直接使用已获取的数据
      });

      // 导入成功后提示并跳转
      toast({
        title: '工作流导入成功',
        status: 'success',
        duration: 5000,
        isClosable: true
      });

      // 清除sessionStorage中的utm_workflow
      sessionStorage.removeItem('utm_workflow');

      // 延迟一下再跳转，确保用户看到成功消息
      setTimeout(() => {
        setIsLoading(false);
        router.push(`/app/detail?appId=${appId}`);
      }, 1500);
    } catch (error) {
      console.error('导入工作流失败:', error);
      setStatus(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);

      toast({
        title: '导入工作流失败',
        description: error instanceof Error ? error.message : '未知错误',
        status: 'error',
        duration: 5000,
        isClosable: true
      });

      setTimeout(() => {
        setIsLoading(false);
      }, 2000);
    }
  };

  // 取消导入
  const handleCancel = () => {
    setShowJsonImporter(false);
    // 清除sessionStorage中的utm_workflow
    sessionStorage.removeItem('utm_workflow');
  };

  return (
    <>
      {/* 加载中状态弹窗 */}
      <Modal isOpen={isLoading} onClose={() => {}} closeOnOverlayClick={false} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>导入工作流</ModalHeader>
          <ModalBody>
            <Flex direction="column" align="center" justify="center" py={4}>
              <Spinner size="xl" color="blue.500" mb={4} />
              <Text>{status}</Text>
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* JSON配置导入窗口 */}
      <Modal
        isOpen={showJsonImporter}
        onClose={handleCancel}
        closeOnOverlayClick={true}
        isCentered
        size="xl"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>导入工作流配置</ModalHeader>
          <ModalBody>
            <Text mb={4}>
              已从URL获取工作流配置，您可以检查并编辑下方的配置，然后点击导入按钮完成导入。
            </Text>
            <ImportAppConfigEditor value={defaultJson} onChange={setDefaultJson} rows={12} />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCancel}>
              取消
            </Button>
            <Button colorScheme="blue" onClick={() => handleImportWorkflow(defaultJson)}>
              导入
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default WorkflowImporter;
