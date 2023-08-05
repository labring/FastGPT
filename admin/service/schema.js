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

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  avatar: {
    type: String,
    default: '/icon/human.png'
  },
  balance: {
    type: Number,
    default: 0
  },
  limit: {
    exportKbTime: {
      // Every half hour
      type: Date
    }
  }
});

// 新增: 定义 pays 模型
const paySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  price: Number,
  orderId: String,
  status: String,
  createTime: Date,
  __v: Number
});

// 新增: 定义 kb 模型
const kbSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  avatar: String,
  name: String,
  tags: [String],
  updateTime: Date,
  __v: Number
});

const appSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  avatar: String,
  status: String,
  intro: String,
  share: {
    topNum: Number,
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

export const App = mongoose.models['app'] || mongoose.model('app', appSchema);
export const Kb = mongoose.models['kb'] || mongoose.model('kb', kbSchema);
export const User = mongoose.models['user'] || mongoose.model('user', UserSchema);
export const Pay = mongoose.models['pay'] || mongoose.model('pay', paySchema);
