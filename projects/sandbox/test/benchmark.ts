/**
 * 沙盒性能基准测试
 *
 * 测量：冷启动延迟、热执行延迟、吞吐量、并发能力
 */
import { JsRunner } from '../src/runner/js-runner';
import { PythonRunner } from '../src/runner/python-runner';

const runnerConfig = {
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10,
};

async function bench(name: string, fn: () => Promise<any>, iterations: number = 20) {
  const times: number[] = [];

  // warmup 2 次
  for (let i = 0; i < 2; i++) await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const min = times[0];
  const max = times[times.length - 1];

  console.log(`\n📊 ${name} (${iterations} runs)`);
  console.log(`   avg: ${avg.toFixed(1)}ms | p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | p99: ${p99.toFixed(1)}ms`);
  console.log(`   min: ${min.toFixed(1)}ms | max: ${max.toFixed(1)}ms`);
  return { name, avg, p50, p95, min, max };
}

async function benchConcurrent(name: string, fn: () => Promise<any>, concurrency: number, total: number) {
  const start = performance.now();
  let completed = 0;
  let errors = 0;

  const worker = async () => {
    while (completed + errors < total) {
      try {
        const result = await fn();
        if (result.success) completed++;
        else errors++;
      } catch {
        errors++;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsed = performance.now() - start;
  const qps = (completed / elapsed) * 1000;

  console.log(`\n🚀 ${name} (concurrency=${concurrency}, total=${total})`);
  console.log(`   completed: ${completed} | errors: ${errors} | elapsed: ${(elapsed / 1000).toFixed(2)}s`);
  console.log(`   QPS: ${qps.toFixed(1)} req/s`);
  return { name, completed, errors, elapsed, qps };
}

async function main() {
  const js = new JsRunner(runnerConfig);
  const py = new PythonRunner(runnerConfig);

  console.log('='.repeat(60));
  console.log('FastGPT Sandbox Performance Benchmark');
  console.log('='.repeat(60));

  // 1. 简单计算
  await bench('JS - 简单计算 (1+1)', () =>
    js.execute({ code: 'function main() { return 1 + 1 }', variables: {} })
  );

  await bench('Python - 简单计算 (1+1)', () =>
    py.execute({ code: 'def main():\n    return 1 + 1', variables: {} })
  );

  // 2. 带变量
  await bench('JS - 变量传递', () =>
    js.execute({
      code: 'function main(v) { return { sum: v.a + v.b, product: v.a * v.b } }',
      variables: { a: 42, b: 58 }
    })
  );

  await bench('Python - 变量传递', () =>
    py.execute({
      code: 'def main(v):\n    return {"sum": v["a"] + v["b"], "product": v["a"] * v["b"]}',
      variables: { a: 42, b: 58 }
    })
  );

  // 3. 复杂计算（斐波那契）
  await bench('JS - 斐波那契(30)', () =>
    js.execute({
      code: `function main() {
        function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }
        return fib(30);
      }`,
      variables: {}
    })
  );

  await bench('Python - 斐波那契(30)', () =>
    py.execute({
      code: `def main():
    def fib(n):
        return n if n <= 1 else fib(n-1) + fib(n-2)
    return fib(30)`,
      variables: {}
    })
  );

  // 4. require 包
  await bench('JS - require lodash', () =>
    js.execute({
      code: `function main(v) {
        const _ = require('lodash');
        return _.pick(v, ['a']);
      }`,
      variables: { a: 1, b: 2, c: 3 }
    })
  );

  // 5. 并发测试
  await benchConcurrent('JS - 并发 (c=5)', () =>
    js.execute({ code: 'function main() { return 1 }', variables: {} }),
    5, 50
  );

  await benchConcurrent('JS - 并发 (c=10)', () =>
    js.execute({ code: 'function main() { return 1 }', variables: {} }),
    10, 100
  );

  await benchConcurrent('Python - 并发 (c=5)', () =>
    py.execute({ code: 'def main():\n    return 1', variables: {} }),
    5, 50
  );

  await benchConcurrent('Python - 并发 (c=10)', () =>
    py.execute({ code: 'def main():\n    return 1', variables: {} }),
    10, 100
  );

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
}

main().catch(console.error);
