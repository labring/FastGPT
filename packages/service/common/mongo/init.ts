import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../system/log';
import type { Mongoose } from 'mongoose';

const maxConnecting = Math.max(30, Number(process.env.DB_MAX_LINK || 20));

/**
 * connect MongoDB and init data
 */
export async function connectMongo(props: {
  db: Mongoose;
  url: string;
  connectedCb?: () => void;
}): Promise<Mongoose> {
  const { db, url, connectedCb } = props;

  /* Connecting, connected will return */
  if (db.connection.readyState !== 0) {
    return db;
  }

  const RemoveListeners = () => {
    db.connection.removeAllListeners('error');
    db.connection.removeAllListeners('disconnected');
  };

  console.log('MongoDB start connect');
  try {
    // Remove existing listeners to prevent duplicates
    RemoveListeners();
    db.set('strictQuery', 'throw');

    db.connection.on('error', async (error) => {
      console.log('mongo error', error);
      try {
        if (db.connection.readyState !== 0) {
          RemoveListeners();
          await db.disconnect();
          await delay(1000);
          await connectMongo(props);
        }
      } catch (error) {}
    });
    db.connection.on('disconnected', async () => {
      console.log('mongo disconnected');
      try {
        if (db.connection.readyState !== 0) {
          RemoveListeners();
          await db.disconnect();
          await delay(1000);
          await connectMongo(props);
        }
      } catch (error) {}
    });

    await db.connect(url, {
      bufferCommands: true,
      maxConnecting: maxConnecting, // 最大连接数: 防止连接数过多时无法满足需求
      maxPoolSize: maxConnecting, // 最大连接池大小: 防止连接池过大时无法满足需求
      minPoolSize: 20, // 最小连接数: 20,防止连接数过少时无法满足需求
      connectTimeoutMS: 60000, // 连接超时: 60秒,防止连接失败时长时间阻塞
      waitQueueTimeoutMS: 60000, // 等待队列超时: 60秒,防止等待队列长时间阻塞
      socketTimeoutMS: 60000, // Socket 超时: 60秒,防止Socket连接失败时长时间阻塞
      maxIdleTimeMS: 300000, // 空闲连接超时: 5分钟,防止空闲连接长时间占用资源
      retryWrites: true, // 重试写入: 重试写入失败的操作
      retryReads: true, // 重试读取: 重试读取失败的操作
      serverSelectionTimeoutMS: 10000, // 服务器选择超时: 10秒,防止副本集故障时长时间阻塞
      w: 'majority' // 写入确认策略: 多数节点确认后返回,保证数据安全性
    });
    console.log('mongo connected');

    connectedCb?.();

    return db;
  } catch (error) {
    addLog.error('Mongo connect error', error);

    await db.disconnect();

    await delay(1000);
    return connectMongo(props);
  }
}
