
import NodeCache from 'node-cache';
import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const cache = new NodeCache({ stdTTL: parseInt(process.env.STD_TTL || '3600') });
const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
const dbName = 'pageCache';
const collectionName = 'pages';

const connectToMongo = async () => {
  await mongoClient.connect();
  return mongoClient.db(dbName);
};

const createTTLIndex = async () => {
  try {
    const db = await connectToMongo();
    await db.collection(collectionName).createIndex({ "updatedAt": 1 }, { expireAfterSeconds: parseInt(process.env.EXPIRE_AFTER_SECONDS || '9000') });
    console.log("TTL index created successfully");
  } catch (error) {
    console.error("Error creating TTL index:", error);
  }
};

const getPageHash = (content: string) => {
  return crypto.createHash('md5').update(content).digest('hex');
};

export const getCachedPage = async (url: string) => {
  const cachedPage = cache.get(url);
  if (cachedPage) return cachedPage;

  try {
    const db = await connectToMongo();
    const page = await db.collection(collectionName).findOne({ url });
    if (page) cache.set(url, page);
    return page;
  } catch (error) {
    console.error('Error getting cached page:', error);
    throw error;
  }
};

const savePageToCache = async (url: string, content: string) => {
  const hash = getPageHash(content);
  const page = { url, content, hash, updatedAt: new Date() };

  cache.set(url, page); // 更新内存缓存

  try {
    const db = await connectToMongo();
    await db.collection(collectionName).updateOne(
      { url },
      { $set: page },
      { upsert: true }
    ); // 更新持久化缓存
  } catch (error) {
    console.error('Error saving page to cache:', error);
    throw error;
  }
};

export const updateCacheAsync = async (url: string, content: string) => {
  await savePageToCache(url, content);
};

process.on('SIGINT', async () => {
  await mongoClient.close();
  process.exit(0);
});

// 在应用启动时创建 TTL 索引
createTTLIndex();