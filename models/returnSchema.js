const mongoose = require('mongoose');
const { Schema } = mongoose;

const returnSchema = new mongoose.Schema({
  userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
  },
  orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
  },
  reason: {
      type: String,
      required: true
  },
  status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
  },
  refundAmount: {
      type: Number,
      required: true
  },
  returnedAt: {
      type: Date,
      default: Date.now
  },
  approvedAt: Date,
  rejectedAt: Date,
  comments: String,
  itemCondition: {
      type: String,
      enum: ['Unopened', 'Used', 'Damaged'],
      required: false
  }
});

const Return = mongoose.model('Return', returnSchema);
module.exports = Return;