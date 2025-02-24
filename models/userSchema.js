const mongoose = require("mongoose");
const {Schema} = mongoose;


const userSchema = new Schema({
    name: {
        type: String,
        required : true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        default:null
    },
    googleId: {
        type: String,
        unique:true,
        
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart",
    }],
    wallet:{
        type:Number,
        default:0,
        min: 0 ,
    },
    wishlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    orderHistory:[{
        type:Schema.Types.ObjectId,
        ref:"Order"
    }],
    createdOn : {
        type:Date,
        default:Date.now,
        immutable: true
    },
    referralCode: {
        type: String,
        unique: true
     },
     referredBy: { 
        type: String, 
        default: null },
    redeemed:{
        type:Boolean
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref:"User"
    }],
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref:"Category",
        },
        searchOn : {
            type: Date,
            default: Date.now
        }
    }],   
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    }
}, {
    timestamps: true
})

userSchema.methods.isActive = function() {
    return this.status === 'active' && !this.isBlocked;
};

const User = mongoose.model("User",userSchema);

module.exports = User;