# 前端 React 性能检查标准

## 1. 不必要的组件重渲染 🟡

父组件状态变化导致子组件不必要地重新渲染，在昂贵组件（复杂列表、图表、编辑器）上会造成明显卡顿。

**识别信号**：子组件接收的 props 在父组件状态变化时并未改变，但子组件仍然重渲染。

```typescript
// ❌ 父组件 count 变化 → ExpensiveChild 不必要地重渲染
const Parent = ({ items }: { items: Item[] }) => {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      {items.map(item => <ExpensiveChild data={item} key={item.id} />)}
    </>
  );
};

// ✅ 用 React.memo 跳过 props 未变化的渲染
const ExpensiveChild = React.memo(function ExpensiveChild({ data }: { data: Item }) {
  return <div>{/* 昂贵渲染 */}</div>;
});
```

**注意**：`React.memo` 对 props 做浅比较，如果传入的是每次新建的对象/函数引用，memo 无效——需要配合下面的优化。

---

## 2. 渲染函数中创建对象或函数 🟡

每次渲染都创建新的对象/数组/函数引用，导致子组件的 `React.memo` 失效，或 `useEffect` 依赖项频繁触发。

```typescript
// ❌ 每次渲染都创建新的函数和对象引用
const MyComponent = ({ items }: { items: Item[] }) => {
  return (
    <>
      {items.map(item => (
        <Child
          key={item.id}
          onClick={() => handleClick(item.id)}       // 每次渲染新函数
          options={{ enable: true, mode: 'edit' }}   // 每次渲染新对象
        />
      ))}
    </>
  );
};

// ✅ 用 useCallback/useMemo 稳定引用
const MyComponent = ({ items }: { items: Item[] }) => {
  const handleClick = useCallback((id: string) => {
    // 处理逻辑
  }, []);  // 依赖项为空，引用永远稳定

  const options = useMemo(() => ({ enable: true, mode: 'edit' }), []);

  return (
    <>
      {items.map(item => (
        <Child
          key={item.id}
          onClick={() => handleClick(item.id)}
          options={options}
        />
      ))}
    </>
  );
};
```

**判断标准**：只有当子组件是 `React.memo` 包裹的，或该引用是某个 `useEffect`/`useCallback` 的依赖项时，才需要稳定引用。普通非 memo 组件的 props 无需此优化。

---

## 3. 昂贵计算未缓存 🟡

在渲染函数中进行复杂的数组操作（sort、filter、reduce 的链式调用），每次渲染都重新计算，即使输入数据未变化。

```typescript
// ❌ 每次渲染都重新排序和过滤
const ExpensiveList = ({ items }: { items: Item[] }) => {
  const sortedItems = [...items].sort((a, b) => a.value - b.value);
  const filteredItems = sortedItems.filter(item => item.active);
  return <ul>{filteredItems.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
};

// ✅ useMemo 缓存计算结果，只在 items 变化时重新计算
const ExpensiveList = ({ items }: { items: Item[] }) => {
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.value - b.value),
    [items]
  );
  const filteredItems = useMemo(
    () => sortedItems.filter(item => item.active),
    [sortedItems]
  );
  return <ul>{filteredItems.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
};
```

**判断标准**：操作数组长度超过 100 条，或包含复杂排序/计算逻辑时，值得用 `useMemo` 缓存。简单的几条数据无需优化。

---

## 4. 大列表缺少虚拟化 🟢

一次性渲染几百上千个 DOM 节点，会导致首次渲染慢、滚动卡顿、内存占用高。

```typescript
// ❌ 渲染1000条数据 → 1000个真实DOM节点
const List = ({ items }: { items: Item[] }) => (
  <div>
    {items.map(item => <Row key={item.id} data={item} />)}
  </div>
);

// ✅ 虚拟化（仅渲染可见区域的节点）
import { VariableSizeList } from 'react-window';

const VirtualList = ({ items }: { items: Item[] }) => (
  <VariableSizeList
    height={600}
    itemCount={items.length}
    itemSize={() => 50}
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        <Row data={items[index]} />
      </div>
    )}
  </VariableSizeList>
);
```

**判断标准**：列表超过 200 条且需要同时显示在页面上时，建议虚拟化。
