const mongoose = require("mongoose");
const {Schema} = mongoose;
const {v4:uuidv4} = require("uuid");


const orderSchema = new Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User',required: true },
    orderId: {
        type: String,
        default: () => uuidv4(),
        required: true,
        unique: true
    },
    orderedItems: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        variantId: {
            type: String,
            required: true
        },
        color: String,
        size: String,
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        },
        discountAmount: {   
            type: Number,
            default: 0   
        },
        returnRequested: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Requested", "Returned"],
            default: "Pending"
        },
        cancellation: {
            isCancelled: {
                type: Boolean,
                default: false
            },
            cancelledAt: Date,
            cancelReason: String,
            cancelNote: String,
            cancelledBy: {
                type: String,
                enum: ['user', 'admin']
            }
        },
        returnDetails: {
            reason: String,
            note: String,
            requestedAt: Date,
            approvedAt: Date,
            rejectedAt: Date,
            completedAt: Date,
            status: {
                type: String,
                enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
                default: 'Pending'
            }
        },
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: "Address",  
        required: true
      },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: [
            'Pending', 
            'Processing', 
            'Shipped', 
            'Delivered', 
            'Cancelled', 
            'Partially Cancelled',
            'Partially Delivered',
            'Partially Returned',
            'Return Requested',
            'Returned'
        ],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponCode: {   
        type: String,
        default: null
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Partially Refunded'],
    },
    
    refundDetails: {
        refundedAt: Date,
        refundAmount: Number,
        refundStatus: {
            type: String,
            enum: ['Pending', 'Completed', 'Failed'],
            default: 'Pending'
        },
        refundedToWallet: Boolean
    }
});

const Order = mongoose.model("Order",orderSchema);

module.exports = Order;