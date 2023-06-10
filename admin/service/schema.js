import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const mongoUrl = process.env.MONGODB_URI;
const mongoDBName = process.env.MONGODB_NAME;

if (!mongoUrl || !mongoDBName) {
  throw new Error('db error');
}

mongoose
  .connect(mongoUrl, {
    dbName: mongoDBName,
    bufferCommands: true,
    maxPoolSize: 5,
    minPoolSize: 1,
    maxConnecting: 5
  })
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch((err) => console.log(`Error connecting to MongoDB: ${err}`));

const userSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  username: String,
  password: String,
  balance: Number,
  promotion: {
    rate: Number
  },
  openaiKey: String,
  avatar: String,
  createTime: Date
});

// 新增: 定义 pays 模型
const paySchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  price: Number,
  orderId: String,
  status: String,
  createTime: Date,
  __v: Number
});

// 新增: 定义 kb 模型
const kbSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  avatar: String,
  name: String,
  tags: [String],
  updateTime: Date,
  __v: Number
});

const modelSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  avatar: String,
  status: String,
  chat: {
    relatedKbs: [mongoose.Schema.Types.ObjectId],
    searchMode: String,
    systemPrompt: String,
    temperature: Number,
    chatModel: String
  },
  share: {
    isShare: Boolean,
    isShareDetail: Boolean,
    intro: String,
    collection: Number
  },
  security: {
    domain: [String],
    contextMaxLen: Number,
    contentMaxLen: Number,
    expiredTime: Number,
    maxLoadAmount: Number
  },
  updateTime: Date
});

export const Model = mongoose.model('Model', modelSchema);
export const Kb = mongoose.model('Kb', kbSchema);
export const User = mongoose.model('User', userSchema, 'users');
export const Pay = mongoose.model('Pay', paySchema, 'pays');
