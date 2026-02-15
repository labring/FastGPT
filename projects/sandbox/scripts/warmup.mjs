// JS 预热脚本 - 预加载常用模块，进入等待循环
// 用于进程池模式，通过 stdin 逐行接收任务

// 预加载常用模块（启动时一次性加载）
try { require('lodash'); } catch {}
try { require('dayjs'); } catch {}
try { require('crypto'); } catch {}
try { require('qs'); } catch {}

const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const task = JSON.parse(line);
      await executeTask(task);
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ success: false, error: err?.message ?? String(err) }) + '\n'
      );
    }
  }
}

async function executeTask(task) {
  const { code, variables, tempDir, diskMB } = task;

  try {
    // 动态执行用户代码
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      'variables',
      'SystemHelper',
      'require',
      code + '\nreturn await main(variables);'
    );
    const result = await fn(variables, globalThis.SystemHelper, globalThis.require);
    process.stdout.write(JSON.stringify({ success: true, result }) + '\n');
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ success: false, error: err?.message ?? String(err) }) + '\n'
    );
  }
}
