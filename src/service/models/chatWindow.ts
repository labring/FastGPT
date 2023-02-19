import { Schema, model, models } from 'mongoose';

const ChatWindowSchema = new Schema({
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'chat',
    required: true
  },
  updateTime: {
    type: Number,
    required: true
  },
  content: [
    {
      obj: {
        type: String,
        required: true,
        enum: ['Human', 'AI', 'SYSTEM']
      },
      value: {
        type: String,
        required: true
      }
    }
  ]
});

export const ChatWindow = models['chatWindow'] || model('chatWindow', ChatWindowSchema);
