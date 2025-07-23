import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Box,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  List,
  ListItem,
  ListIcon,
  Divider,
  Code,
  Badge
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface TeamSwitchGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  teamCount: number;
}

const TeamSwitchGuideModal: React.FC<TeamSwitchGuideModalProps> = ({
  isOpen,
  onClose,
  username,
  teamCount
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack>
            <MyIcon name={'support/team/group'} w={'20px'} />
            <Text>团队应用访问说明</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Alert status="success">
              <AlertIcon />
              <Box>
                <AlertTitle>团队切换功能已启用</AlertTitle>
                <AlertDescription>
                  <Badge colorScheme="orange">FastGPT 开源版</Badge> 现在支持完整的团队切换功能！
                  用户 <Badge colorScheme="blue">{username}</Badge> 可以在 {teamCount}{' '}
                  个团队之间自由切换， 查看不同团队的应用和资源。
                </AlertDescription>
              </Box>
            </Alert>

            <Box p={4} bg="gray.50" borderRadius="md">
              <Text fontWeight="semibold" mb={2}>
                🔒 权限隔离机制
              </Text>
              <Text fontSize="sm" color="gray.600">
                FastGPT 采用严格的团队权限隔离，确保不同团队的数据和应用相互独立，保障数据安全。
              </Text>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight="semibold" mb={3}>
                📋 如何使用团队切换功能
              </Text>

              <List spacing={3}>
                <ListItem>
                  <ListIcon as={MyIcon} name={'common/1'} color="green.500" />
                  <Text as="span" fontWeight="medium">
                    应用列表页面
                  </Text>
                  <Text fontSize="sm" color="gray.600" mt={1}>
                    在应用列表页面的头部，使用团队选择器切换团队
                  </Text>
                </ListItem>

                <ListItem>
                  <ListIcon as={MyIcon} name={'common/2'} color="green.500" />
                  <Text as="span" fontWeight="medium">
                    账户信息页面
                  </Text>
                  <Text fontSize="sm" color="gray.600" mt={1}>
                    在账户信息页面的团队信息区域切换团队
                  </Text>
                </ListItem>

                <ListItem>
                  <ListIcon as={MyIcon} name={'common/3'} color="green.500" />
                  <Text as="span" fontWeight="medium">
                    即时切换
                  </Text>
                  <Text fontSize="sm" color="gray.600" mt={1}>
                    选择目标团队后，系统会自动切换并刷新页面
                  </Text>
                </ListItem>

                <ListItem>
                  <ListIcon as={MyIcon} name={'common/4'} color="green.500" />
                  <Text as="span" fontWeight="medium">
                    完整功能
                  </Text>
                  <Text fontSize="sm" color="gray.600" mt={1}>
                    切换后可以查看和管理新团队的所有应用和资源
                  </Text>
                </ListItem>
              </List>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight="semibold" mb={2}>
                🎯 功能特点
              </Text>
              <VStack align="start" spacing={2} fontSize="sm">
                <HStack>
                  <Badge colorScheme="blue">原生集成</Badge>
                  <Text color="gray.600">使用FastGPT原生的团队切换组件</Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="green">完整功能</Badge>
                  <Text color="gray.600">支持所有团队管理和切换功能</Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="purple">开源版</Badge>
                  <Text color="gray.600">无需商业版许可证即可使用</Text>
                </HStack>
              </VStack>
              <Code p={3} bg="green.50" color="green.800" borderRadius="md" mt={2} display="block">
                ✅ 开源版团队切换：完全兼容FastGPT的团队管理系统！
                <br />
                用户可以享受与商业版相同的团队切换体验。
              </Code>
            </Box>

            <Box p={4} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.200">
              <Text fontWeight="semibold" mb={2} color="yellow.800">
                📝 详细操作步骤
              </Text>
              <VStack align="start" spacing={2} fontSize="sm" color="yellow.700">
                <HStack>
                  <Badge colorScheme="yellow" variant="solid">
                    1
                  </Badge>
                  <Text>点击左侧导航栏的&quot;账户&quot;图标（用户头像下方）</Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="yellow" variant="solid">
                    2
                  </Badge>
                  <Text>选择&quot;账户信息&quot;或&quot;团队管理&quot;页面</Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="yellow" variant="solid">
                    3
                  </Badge>
                  <Text>找到显示当前团队名称的下拉选择框</Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="yellow" variant="solid">
                    4
                  </Badge>
                  <Text>点击下拉框，选择要切换的目标团队</Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="yellow" variant="solid">
                    5
                  </Badge>
                  <Text>页面自动刷新，返回应用列表查看新团队的应用</Text>
                </HStack>
              </VStack>
            </Box>

            <Alert status="warning" variant="left-accent">
              <AlertIcon />
              <Box>
                <AlertTitle fontSize="sm">注意事项</AlertTitle>
                <AlertDescription fontSize="sm">
                  • 切换团队后页面会刷新，当前操作可能丢失
                  <br />
                  • 不同团队的数据完全隔离，无法跨团队访问
                  <br />
                  • 团队权限由团队管理员分配和管理
                  <br />• 只能切换到已加入的团队，无法访问未加入的团队
                </AlertDescription>
              </Box>
            </Alert>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button
              colorScheme="blue"
              onClick={() => {
                window.open('/dashboard/apps', '_blank');
                onClose();
              }}
            >
              前往应用列表
            </Button>
            <Button
              colorScheme="green"
              onClick={() => {
                window.open('/account/info', '_blank');
                onClose();
              }}
            >
              前往账户信息
            </Button>
            <Button variant="ghost" onClick={onClose}>
              我知道了
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default TeamSwitchGuideModal;
