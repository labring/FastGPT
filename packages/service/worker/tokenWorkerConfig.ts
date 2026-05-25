import { availableParallelism, cpus } from 'os';

/**
 * Token 计算 worker 数量跟随当前运行环境可用 CPU 数，最多保留 4 个。
 *
 * tokenizer 会在每个 worker 内各自加载一份编码表，worker 过多会放大常驻内存；
 * 这里固定为 min(cpu, 4)，不再暴露配置项，避免部署环境误配过多 worker。
 * availableParallelism 会优先考虑容器 CPU 配额，拿不到时再回退到物理 CPU 数。
 */
export const getTokenWorkerCount = () => {
  const availableCpu = availableParallelism?.() || cpus().length || 1;
  return Math.max(1, Math.min(availableCpu, 4));
};
