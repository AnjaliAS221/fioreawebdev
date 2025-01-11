const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['paid', 'pending', 'cancelled'],
        default: 'pending'
    }
});

module.exports = mongoose.model('Invoice', invoiceSchema);