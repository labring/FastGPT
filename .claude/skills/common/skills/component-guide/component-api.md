# 核心组件 API 速查

> 手动维护。仅收录最高频使用的通用组件，业务组件请直接阅读源码。

---

## MyModal — 弹窗

```tsx
import MyModal from '@fastgpt/web/components/common/MyModal';
import { ModalBody, ModalFooter, Button } from '@chakra-ui/react';

<MyModal
  isOpen={isOpen}
  onClose={onClose}
  title="弹窗标题"
  iconSrc="/imgs/modal/xxx.svg"   // 可选，标题旁图标
  isCentered                       // 垂直居中
  maxW={['90vw', '600px']}        // 可覆盖
  isLoading={loading}              // 展示加载蒙层
>
  <ModalBody>...</ModalBody>
  <ModalFooter gap={2}>
    <Button variant="whiteBase" onClick={onClose}>取消</Button>
    <Button onClick={onConfirm}>确认</Button>
  </ModalFooter>
</MyModal>
```

**Props**: `isOpen` `onClose` `title` `iconSrc` `iconColor` `isCentered` `isLoading` `size('md'|'lg')` `showCloseButton` `closeOnOverlayClick` `closeOnEsc`

---

## MySelect — 下拉选择

```tsx
import MySelect from '@fastgpt/web/components/common/MySelect';

<MySelect
  value={selected}
  onChange={(val) => setSelected(val)}
  list={[
    { label: '选项A', value: 'a' },
    { label: '选项B', value: 'b', icon: 'edit' }
  ]}
  placeholder="请选择"
  isLoading={false}
/>
```

**`list` 每项**: `{ label, value, icon?, avatar?, description?, isDisabled? }`

---

## MyMenu — 操作菜单

```tsx
import MyMenu from '@fastgpt/web/components/common/MyMenu';

<MyMenu
  Button={<IconButton aria-label="" icon={<MyIcon name="more" />} />}
  trigger="click"        // 'hover' | 'click'
  placement="bottom-end"
  menuList={[
    {
      children: [
        { label: '编辑', icon: 'edit', onClick: handleEdit },
        { label: '删除', icon: 'delete', type: 'danger', onClick: handleDelete }
      ]
    }
  ]}
/>
```

**菜单项 `type`**: `'primary' | 'danger' | 'gray' | 'grayBg'`

---

## MyBox — 带加载态容器

```tsx
import MyBox from '@fastgpt/web/components/common/MyBox';

// 继承全部 BoxProps，额外支持 isLoading / text / size
<MyBox isLoading={loading} text="加载中..." flex="1" p={4}>
  {children}
</MyBox>
```

---

## EmptyTip — 空状态

```tsx
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

<EmptyTip text="暂无数据" iconSize="48px" py="10vh" />
```

---

## MyIcon — 图标

```tsx
import MyIcon from '@fastgpt/web/components/common/Icon';

<MyIcon name="edit" w="16px" h="16px" color="primary.500" />
```

图标名见 `packages/web/components/common/Icon/constants.ts`

---

## MyTooltip — 气泡提示

```tsx
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

<MyTooltip label="提示文字" placement="top">
  <Button>hover me</Button>
</MyTooltip>
```

---

## SearchInput — 搜索框

```tsx
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

<SearchInput
  value={keyword}
  onChange={(e) => setKeyword(e.target.value)}
  placeholder="搜索..."
  w="200px"
/>
```

---

## PromptEditor — 提示词编辑器（支持变量插入）

```tsx
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';

<PromptEditor
  value={prompt}
  onChange={setPrompt}
  variables={[{ key: 'name', label: '用户名' }]}
  placeholder="输入提示词，用 {{ }} 插入变量"
/>
```

---

## MyMenu + Confirm — 带确认的危险操作

```tsx
// 推荐用 PopoverConfirm 替代 window.confirm
import PopoverConfirm from '@fastgpt/web/components/common/MyModal/PopoverConfirm';

<PopoverConfirm
  content="确定删除？此操作不可恢复"
  type="delete"
  onConfirm={handleDelete}
>
  <Button colorScheme="red">删除</Button>
</PopoverConfirm>
```

---

## 代码规范

### ✅ 正确

```tsx
import MyModal from '@fastgpt/web/components/common/MyModal';

const MyFeatureModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
  <MyModal isOpen={isOpen} onClose={onClose} title="功能标题" isCentered>
    <ModalBody>内容</ModalBody>
  </MyModal>
);
```

### ❌ 禁止

```tsx
// 禁止绕过封装组件，直接使用 Chakra 原始 Modal
import { Modal, ModalOverlay, ModalContent, ModalHeader } from '@chakra-ui/react';

// 禁止重新实现 Select、Menu 等已有组件
const MySelect = () => <select>...</select>;
```
