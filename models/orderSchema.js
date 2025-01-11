const mongoose = require("mongoose");
const {Schema} = mongoose;
const {v4:uuidv4} = require("uuid");


const orderSchema = new Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    orderId: {
        type:String,
        default: ()=>uuidv4(),
        required: true,
        unique:true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity:{
            type: Number,
            required:true
        },
        price:{
            type:Number,
            default:0
        },
    }],
    totalPrice: {
        type:Number,
        required:true
    },
    discount: {
        type:Number,
        default:0
    },
    finalAmount:{   
        type:Number,
        required:true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: "Address",
        required: true
    },
    
    invoiceDate: {
        type: Date
    },
    status:  {
        type:String,
        required:true,
        enum: ["Pending","Processing","Shipped","Delivered","Cancelled","Return Request","Returned","Failed"]
    },
    createdAt: {
        type:Date,
        default: Date.now,
        required:true
    },
    couponApplied:{
        type: Boolean,
        default: false
    },
    paymentMethod:{
        type:String,
        required:true
    },
    paymentStatus:{
        type:String,
        enum:["Pending","Processing","Paid","Refunded","Failed"]
    },
    cancellation: {
        isCancelled: {
            type: Boolean,
            default: false
        },
        cancelledAt: {
            type: Date,
        },
        cancelReason: {
            type: String,
        },
        cancelNote: {
            type: String,
        },
        cancelledBy: {
            type: String,
            enum: ['user', 'admin'],
        }
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
})

const Order = mongoose.model("Order",orderSchema);
module.exports = Order;