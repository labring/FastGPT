import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { importWorkflowFromUrl } from '@/web/core/app/workflow';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  Flex,
  Spinner,
  Text,
  useToast
} from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';

const WorkflowImporter = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { userInfo } = useUserStore();
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    // 添加浏览器环境检查
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return; // 如果不是浏览器环境，直接返回

    // 只有用户已登录时检查
    if (!userInfo?.username) {
      return;
    }

    const checkAndImportWorkflow = async () => {
      try {
        let workflowUrl = sessionStorage.getItem('utm_workflow');

        if (!workflowUrl) {
          return;
        }

        sessionStorage.removeItem('utm_workflow');

        setIsImporting(true);
        setImportStatus('正在准备导入工作流...');

        toast({
          title: '发现工作流URL，正在导入...',
          status: 'info',
          duration: 5000,
          isClosable: true
        });

        try {
          setImportStatus('正在从URL获取工作流数据...');

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

          // 导入工作流
          const appId = await importWorkflowFromUrl({
            url: workflowUrl,
            name: `${content}`
          });

          setImportStatus('工作流导入成功！');

          // 导入成功后提示并跳转
          toast({
            title: '工作流导入成功',
            status: 'success',
            duration: 5000,
            isClosable: true
          });

          // 延迟一下再跳转，确保用户看到成功消息
          setTimeout(() => {
            setIsImporting(false);
            router.push(`/app/detail?appId=${appId}`);
          }, 1500);
        } catch (error) {
          console.error('导入工作流失败:', error);
          setImportStatus(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);

          toast({
            title: '导入工作流失败',
            description: error instanceof Error ? error.message : '未知错误',
            status: 'error',
            duration: 5000,
            isClosable: true
          });

          setTimeout(() => {
            setIsImporting(false);
          }, 2000);
        }
      } catch (error) {
        console.error('检查工作流URL出错:', error);
        setIsImporting(false);
      }
    };

    checkAndImportWorkflow();
  }, [userInfo, router, toast]);

  return (
    <Modal isOpen={isImporting} onClose={() => {}} closeOnOverlayClick={false} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>导入工作流</ModalHeader>
        <ModalBody>
          <Flex direction="column" align="center" justify="center" py={4}>
            <Spinner size="xl" color="blue.500" mb={4} />
            <Text>{importStatus}</Text>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default WorkflowImporter;
