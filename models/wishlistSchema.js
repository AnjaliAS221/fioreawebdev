const mongoose = require("mongoose");
const {Schema} = mongoose;

const wishlistSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    products: {
        productId: [{
            productId:{
                type:Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },
            addedOn: {
                type: Date,
                default: Date.now
            }
        }]
    }
})

const Wishlist = moongose.model("Wishlist",wishlistSchema);
module.exports = Wishlist;