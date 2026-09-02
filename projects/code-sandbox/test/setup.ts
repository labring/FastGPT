import { vi } from 'vitest';

// 宿主机单测验证进程池和执行器逻辑，不具备生产镜像中的 chroot 文件系统与 capability。
// 仅在 Vitest 模块图中替换原生隔离探测；生产代码仍在 Linux 上固定启用并 fail-closed。
vi.mock('../src/isolated/js-isolation-config', async () => {
  const actual = await vi.importActual<typeof import('../src/isolated/js-isolation-config')>(
    '../src/isolated/js-isolation-config'
  );

  return {
    ...actual,
    shouldEnableJsNativeIsolation: () => false,
    assertJsNativeIsolationReady: () => undefined
  };
});

vi.mock('../src/isolated/python-isolation-config', async () => {
  const actual = await vi.importActual<typeof import('../src/isolated/python-isolation-config')>(
    '../src/isolated/python-isolation-config'
  );

  return {
    ...actual,
    shouldEnablePythonNativeIsolation: () => false,
    assertPythonNativeIsolationReady: () => undefined
  };
});
