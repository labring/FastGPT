import { exit } from 'process';

/*
  Init system
*/
export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // 基础系统初始化
      const [{ getToolList }] = await Promise.all([import('@/service/tool/data')]);

      await getToolList();

      console.log('Init system success');
    }
  } catch (error) {
    console.log('Init system error', error);
    exit(1);
  }
}
