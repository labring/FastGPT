import { connectionMongo, getMongoModel, type Model } from '../../mongo';
const { Schema } = connectionMongo;

const DatasetFileSchema = new Schema({});
const ChatFileSchema = new Schema({});

try {
  DatasetFileSchema.index({ uploadDate: -1 });

  ChatFileSchema.index({ uploadDate: -1 });
  ChatFileSchema.index({ 'metadata.chatId': 1 });
} catch (error) {
  console.log(error);
}

export const MongoDatasetFileSchema = getMongoModel('dataset.files', DatasetFileSchema);
export const MongoChatFileSchema = getMongoModel('chat.files', ChatFileSchema);
