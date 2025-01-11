
const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referredId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    earnedAmount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled'],
        default: 'pending'
    },
    completedAt: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('Referral', referralSchema);