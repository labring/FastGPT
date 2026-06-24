import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { statSync } from 'fs';
import { PythonIsolatedRunner } from '../../src/isolated/python-isolated-runner';
import { shouldEnablePythonNativeIsolation } from '../../src/isolated/python-isolation-config';

let runner: PythonIsolatedRunner;

beforeAll(async () => {
  runner = new PythonIsolatedRunner(1);
  await runner.init();
});

afterAll(async () => {
  await runner.shutdown();
});

describe('PythonIsolatedRunner 安全规则兼容旧 pool', () => {
  it.each(['os', 'subprocess', 'sys', 'socket', 'threading', 'multiprocessing', 'signal'])(
    '阻止 import %s',
    async (moduleName) => {
      const result = await runner.execute({
        code: `def main():
    try:
        __import__(${JSON.stringify(moduleName)})
        return {'blocked': False}
    except Exception as e:
        return {'blocked': True, 'error': str(e)}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
      expect(result.data?.codeReturn.error).toContain(moduleName);
    }
  );

  it('builtins.__import__ 覆盖不能恢复危险 import', async () => {
    const result = await runner.execute({
      code: `import builtins
def main():
    changed = False
    try:
        builtins.__import__ = lambda *a, **kw: None
        changed = True
    except Exception:
        pass
    try:
        import os
        escaped = True
    except Exception:
        escaped = False
    return {'changed': changed, 'escaped': escaped}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.changed).toBe(false);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('运行时拼接 getattr 不能访问高危 dunder 属性', async () => {
    const result = await runner.execute({
      code: `def main():
    name = "__" + "subclasses__"
    return {'value': getattr(object, name)()}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/__subclasses__|not allowed/i);
  });

  it('setattr/delattr 即使通过变量名调用也不能改写 builtins 安全函数', async () => {
    const result = await runner.execute({
      code: `import builtins
def main():
    setter = setattr
    deleter = delattr
    result = []
    for fn in (setter, deleter):
        try:
            if fn is setter:
                fn(builtins, "__import__", lambda *a, **kw: None)
            else:
                fn(builtins, "__import__")
            result.append(False)
        except Exception:
            result.append(True)
    return {'blocked': result}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toEqual([true, true]);
  });

  it('即使通过允许的标准库间接拿到 os，命令执行被阻断且宿主 secret env 不泄露', async () => {
    const oldToken = process.env.SANDBOX_TOKEN;
    process.env.SANDBOX_TOKEN = 'test-host-secret-token';
    try {
      const result = await runner.execute({
        code: `import platform
def main():
    os_ref = getattr(platform, 'os')
    system_blocked = False
    try:
        os_ref.system('id')
    except Exception:
        system_blocked = True
    env = dict(os_ref.environ)
    return {
        'system_blocked': system_blocked,
        'has_sandbox_token': 'SANDBOX_TOKEN' in env,
        'has_test_secret': 'test-host-secret-token' in ''.join(env.values())
    }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.system_blocked).toBe(true);
      expect(result.data?.codeReturn.has_sandbox_token).toBe(false);
      expect(result.data?.codeReturn.has_test_secret).toBe(false);
    } finally {
      if (oldToken === undefined) {
        delete process.env.SANDBOX_TOKEN;
      } else {
        process.env.SANDBOX_TOKEN = oldToken;
      }
    }
  });

  it.each([
    ['exec', `exec("import subprocess")`],
    ['eval', `eval("__import__('os')")`],
    ['compile', `exec(compile("import subprocess", "<test>", "exec"))`]
  ])('%s 逃逸被拦截', async (_name, statement) => {
    const result = await runner.execute({
      code: `def main():
    try:
        ${statement}
        return {'escaped': True}
    except Exception:
        return {'escaped': False}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/exec|eval|compile|not allowed/i);
  });

  it.each([
    ['object.__subclasses__', `object.__subclasses__()`],
    ['__class__.__bases__ 链式访问', `().__class__.__bases__[0].__subclasses__()`],
    ['getattr 常量 dunder', `getattr(object, "__subclasses__")()`],
    ['getattr 动态 dunder', `getattr(object, "__sub" + "classes__")()`],
    ['type().__base__ 链式访问', `type(1).__base__.__subclasses__()`]
  ])('阻断 %s 反射逃逸', async (_name, expression) => {
    const result = await runner.execute({
      code: `def main():
    return {'value': ${expression}}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(
      /__class__|__base__|__bases__|__subclasses__|Dynamic getattr|not allowed/i
    );
  });

  it('保留 type() 正常判断与动态创建类兼容', async () => {
    const result = await runner.execute({
      code: `def main():
    MyClass = type('MyClass', (object,), {'x': 42})
    obj = MyClass()
    return {'is_int': type(1) == int, 'x': obj.x}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ is_int: true, x: 42 });
  });

  it.each(['/etc/passwd', '/proc/self/environ'])('阻止 open 读取 %s', async (path) => {
    const result = await runner.execute({
      code: `def main():
    with open(${JSON.stringify(path)}, 'r') as f:
        return {'data': f.read()}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 open 写入文件', async () => {
    const result = await runner.execute({
      code: `def main():
    with open('/tmp/evil.txt', 'w') as f:
        f.write('hacked')
    return {'ok': True}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止标准库或三方库间接写入共享 /tmp，只允许当前任务临时目录', async () => {
    const result = await runner.execute({
      code: `import pandas as pd
def main():
    pd.DataFrame({'a': [1]}).to_csv(task_tmpdir + '/allowed.csv', index=False)
    try:
        pd.DataFrame({'a': [2]}).to_csv('/tmp/shared.csv', index=False)
        shared_tmp_blocked = False
    except Exception:
        shared_tmp_blocked = True
    return {'tmp': task_tmpdir, 'shared_tmp_blocked': shared_tmp_blocked}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.tmp).toMatch(/task-/);
    expect(result.data?.codeReturn.shared_tmp_blocked).toBe(true);
  });

  it('阻止通过允许标准库间接拿到 os 后读取宿主文件系统', async () => {
    const result = await runner.execute({
      code: `import platform
def main():
    os_ref = platform.os
    read_blocked = False
    list_blocked = False
    stat_blocked = False
    try:
        fd = os_ref.open('/etc/passwd', os_ref.O_RDONLY)
        os_ref.close(fd)
    except Exception:
        read_blocked = True
    try:
        os_ref.listdir('/')
    except Exception:
        list_blocked = True
    try:
        os_ref.stat('/etc/passwd')
    except Exception:
        stat_blocked = True
    return {
        'read_blocked': read_blocked,
        'list_blocked': list_blocked,
        'stat_blocked': stat_blocked
    }`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      read_blocked: true,
      list_blocked: true,
      stat_blocked: true
    });
  });

  it('允许通过标准库 os 引用访问当前任务临时目录', async () => {
    const result = await runner.execute({
      code: `import platform
def main():
    os_ref = platform.os
    path = task_tmpdir + '/allowed.txt'
    fd = os_ref.open(path, os_ref.O_CREAT | os_ref.O_WRONLY, 0o600)
    os_ref.write(fd, b'ok')
    os_ref.close(fd)
    fd = os_ref.open(path, os_ref.O_RDONLY)
    data = os_ref.read(fd, 16).decode()
    os_ref.close(fd)
    return {'data': data, 'items': os_ref.listdir(task_tmpdir)}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.data).toBe('ok');
    expect(result.data?.codeReturn.items).toContain('allowed.txt');
  });

  it('允许三方库在当前任务临时目录内创建子目录，但不能写共享 /tmp', async () => {
    const result = await runner.execute({
      code: `import platform
def main():
    os_ref = platform.os
    nested = task_tmpdir + '/nested/cache'
    os_ref.makedirs(nested, exist_ok=True)
    try:
        os_ref.makedirs('/tmp/shared-blocked', exist_ok=True)
        outside_created = True
        outside_error = ''
    except Exception as e:
        outside_created = False
        outside_error = str(e)
    return {
        'nested_exists': os_ref.path.isdir(nested),
        'outside_created': outside_created,
        'outside_error': outside_error
    }`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.nested_exists).toBe(true);
    expect(result.data?.codeReturn.outside_created).toBe(false);
    expect(result.data?.codeReturn.outside_error).toMatch(/task temporary directory|not allowed/i);
  });

  it('matplotlib 可以使用任务临时目录初始化 config/cache', async () => {
    const result = await runner.execute({
      code: `import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def main():
    fig, ax = plt.subplots(figsize=(2, 1))
    ax.plot([1, 2, 3], [1, 4, 9])
    plt.close(fig)
    return {
        'backend': matplotlib.get_backend(),
        'config': matplotlib.get_configdir(),
        'cache': matplotlib.get_cachedir(),
        'figure_axes': len(fig.axes)
    }`,
      variables: {}
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data?.codeReturn.backend.toLowerCase()).toContain('agg');
    expect(result.data?.codeReturn.config).toContain('/matplotlib');
    expect(result.data?.codeReturn.cache).toContain('/matplotlib');
    expect(result.data?.codeReturn.figure_axes).toBe(1);
  });

  it('Linux native 隔离下 chroot /tmp 由 root 持有，仅 task 临时目录可写', async () => {
    if (!shouldEnablePythonNativeIsolation()) {
      return;
    }

    const result = await runner.execute({
      code: `def main():
    return {'tmp': task_tmpdir}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    const tmpStat = statSync('/tmp/fastgpt-python-sandbox/tmp');
    expect(tmpStat.uid).toBe(0);
    expect(tmpStat.mode & 0o777).toBe(0o755);
  });

  it('变量值包含 Python 代码不会被执行', async () => {
    const result = await runner.execute({
      code: `def main(v):
    return {'val': v['code']}`,
      variables: { code: '__import__("os").system("id")' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('__import__("os").system("id")');
  });

  it('无法通过 os 模块读取环境变量', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        import os
        return {'blocked': False, 'env': dict(os.environ)}
    except Exception as e:
        return {'blocked': True, 'error': str(e)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
  });

  it('上一次执行设置的全局变量，下一次读不到', async () => {
    const r1 = await runner.execute({
      code: `def main():
    global secret_data
    secret_data = 'leaked_password_123'
    return {'written': True}`,
      variables: {}
    });
    expect(r1.success).toBe(true);

    const r2 = await runner.execute({
      code: `def main():
    try:
        return {'leaked': True, 'val': secret_data}
    except NameError:
        return {'leaked': False}`,
      variables: {}
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.leaked).toBe(false);
  });

  it('上一次修改的模块状态不影响下一次', async () => {
    const r1 = await runner.execute({
      code: `import json
def main():
    json._polluted = True
    return {'polluted': hasattr(json, '_polluted')}`,
      variables: {}
    });
    expect(r1.success).toBe(true);
    expect(r1.data?.codeReturn.polluted).toBe(true);

    const r2 = await runner.execute({
      code: `import json
def main():
    return {
        'has_pollution': hasattr(json, '_polluted'),
        'dumps_works': json.dumps({'test': 1}) == '{"test": 1}'
    }`,
      variables: {}
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.has_pollution).toBe(false);
    expect(r2.data?.codeReturn.dumps_works).toBe(true);
  });

  it('上一次的 print 输出不泄露到下一次', async () => {
    await runner.execute({
      code: `def main():
    print('secret_token_abc123')
    return {}`,
      variables: {}
    });

    const result = await runner.execute({
      code: `def main():
    return {'ok': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log || '').not.toContain('secret_token_abc123');
  });

  it('上一次传入的 variables 不泄露到下一次', async () => {
    await runner.execute({
      code: `def main(v):
    return {'got': v['apiKey']}`,
      variables: { apiKey: 'sk-secret-key-12345' }
    });

    const result = await runner.execute({
      code: `def main(v):
    leaked = []
    if v and 'apiKey' in v:
        leaked.append('apiKey from vars')
    try:
        _ = apiKey
        leaked.append('apiKey from global')
    except NameError:
        pass
    return {'clean': len(leaked) == 0, 'leaked': leaked}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.clean).toBe(true);
  });
});
