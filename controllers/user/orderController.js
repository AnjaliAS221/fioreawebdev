const User = require('../../models/userSchema')
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Return = require('../../models/returnSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');


const loadCheckout = async (req, res) => {
    try {
        const user = req.session.user;

        const addressDoc = await Address.findOne({ userId: user });
        const addresses = addressDoc ? addressDoc.address : [];

        let totalPrice = 0;
        const productId = req.query.id;

        const availableCoupons = await Coupon.find({
            expireOn: { $gt: new Date() },
            isList: true
        });

        if (productId) {

            const product = await Product.findOne({ _id: productId });
            if (!product) {
                return res.status(400).json({ message: "Product not found" });
            }

            const structuredProduct = {
                _id: product._id,
                productName: product.productName,
                productImage: product.productImage,
                color: req.query.color || product.color,
                size: req.query.size || product.size,
                quantity: parseInt(req.query.quantity) || 1,
                price: product.salePrice || product.price,
                salePrice: product.salePrice,
                totalPrice: (product.salePrice || product.price) * (parseInt(req.query.quantity) || 1)
            };

            totalPrice = structuredProduct.totalPrice;

            return res.render('checkout', {
                cart: null,
                products: null,
                address: addresses,
                totalPrice,
                product: structuredProduct,
                availableCoupons: availableCoupons
            });

        } else {

            const cartItems = await Cart.findOne({ userId: user }).populate('items.productId');
            if (!cartItems) {
                return res.status(400).json({ success: false, message: "Cart is empty" });
            }
            if (cartItems.items.length === 0) {
                return res.redirect('/');
            }

            totalPrice = cartItems.items.reduce((sum, item) => sum + item.totalPrice, 0);


            return res.render('checkout', {
                cart: cartItems,
                products: cartItems.items,
                address: addresses,
                totalPrice,
                product: null,
                availableCoupons: availableCoupons
            });
        }
    } catch (error) {
        console.error("[ERROR] Checkout load error:", error);
        res.redirect('/pageNotFound');
    }
};

const getWalletBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        const wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            return res.status(404).json({ balance: 0 });
        }

        res.json({ balance: Math.floor(wallet.balance) });
    } catch (error) {
        console.error("Error fetching wallet balance:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};



const placeOrderInitial = async (req, res) => {
    try {
        const form = req.body.form || req.body;
        const userId = req.session.user;

        const {
            payment_method,
            finalPrice = 0,
            coupon = null,
            discount = 0,
            cart = null,
            totalPrice = 0,
            addressId,
            singleProduct = null
        } = form;

        if (!addressId || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }

        let parsedSingleProduct = null;
        if (singleProduct) {
            try {
                parsedSingleProduct = typeof singleProduct === 'string' ?
                    JSON.parse(singleProduct) : singleProduct;
            } catch (err) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid product data format'
                });
            }
        }

        if (!cart && !parsedSingleProduct) {
            return res.status(400).json({
                success: false,
                message: 'Either cart or single product information is required'
            });
        }

        if (payment_method === 'Wallet') {
            const userWallet = await Wallet.findOne({ userId });

            if (!userWallet) {
                return res.status(400).json({ success: false, message: 'Wallet not found' });
            }

            if (userWallet.balance < finalPrice) {
                return res.status(400).json({
                    success: false,
                    message: "Insufficient wallet balance. Please add funds or use another payment method."
                });
            }
        }

        let orderedItems = [];

        if (parsedSingleProduct) {
            const product = parsedSingleProduct;
            const productFromDB = await Product.findById(product._id);
            const variant = productFromDB.variants.find(v => v.color === product.color);
            if (!variant) {
                return res.status(400).json({ success: false, message: 'Variant not found for product' });
            }

            const sizeVariant = variant.sizes.find(s => s.size === product.size);
            if (!sizeVariant) {
                return res.status(400).json({ success: false, message: 'Size not found for product' });
            }

            if (sizeVariant.stock < product.quantity) {
                return res.status(400).json({ success: false, message: 'Insufficient stock for selected variant' });
            }

            sizeVariant.stock -= product.quantity;
            await productFromDB.save();

            orderedItems.push({
                product: product._id,
                variantId: variant._id,
                quantity: product.quantity,
                price: product.salePrice || product.price,
                color: product.color,
                size: product.size
            });

        } else if (cart) {
            const cartItems = JSON.parse(cart);

            for (const item of cartItems) {
                const productFromDB = await Product.findById(item.productId);

                const variant = productFromDB.variants.find(v => v._id.toString() === item.variantId);
                if (!variant) {
                    return res.status(400).json({ success: false, message: `Variant not found for product ${item.productId}` });
                }

                const sizeVariant = variant.sizes.find(s => s.size === item.size);
                if (!sizeVariant) {
                    return res.status(400).json({ success: false, message: `Size not found for product ${item.productId}` });
                }

                if (sizeVariant.stock < item.quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for product ${item.productId}` });
                }

                sizeVariant.stock -= item.quantity;
                await productFromDB.save();

                orderedItems.push({
                    product: item.productId,
                    variantId: variant._id,
                    quantity: item.quantity,
                    price: item.totalPrice / item.quantity,
                    color: item.color,
                    size: item.size
                });
            }
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(400).json({
                success: false,
                message: 'No address found for user'
            });
        }

        const address = addressDoc.address.find(
            addr => addr._id.toString() === addressId
        );

        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address ID'
            });
        }

        let paymentStatus = 'Pending';

        const totalProductPrice = orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        orderedItems = orderedItems.map(item => {
            const itemTotal = item.price * item.quantity;
            const itemDiscount = (itemTotal / totalProductPrice) * discount;
            return {
                ...item,
                discountAmount: itemDiscount / item.quantity 
            };
        });

        const order = new Order({
            orderedItems,
            totalPrice,
            discount,
            finalAmount: Number(finalPrice),
            user: userId,
            address: addressId,
            status: 'Pending',
            paymentMethod: payment_method,
            paymentStatus,
            couponCode: coupon || 'N/A',
            couponApplied: Boolean(coupon && discount)
        });

        await order.save();

        if (payment_method === 'Wallet') {
            const userWallet = await Wallet.findOne({ userId });

            userWallet.balance -= finalPrice;
            userWallet.transactions.push({
                type: 'Purchase',
                amount: finalPrice,
                orderId: order._id,
                status: 'Completed',
                description: 'Wallet payment for order'
            });
            await userWallet.save();

            order.paymentStatus = 'Paid';
            order.status = 'Processing';
            await order.save();
        }

        if (coupon) {
            await Coupon.findOneAndUpdate(
                { name: coupon },
                { $push: { userId: userId } }
            );
        }

        if (cart) {
            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [] } }
            );
        }

        return res.status(200).json({
            success: true,
            orderId: order._id,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Error placing order:", error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save order. Please try again.',
            error: error.message
        });
    }
};


const orderConfirm = async (req, res) => {
    try {

        const id = req.query.id
        const order = await Order.findById(id);
        res.render('order-confirmation', { order });

    } catch (error) {
        console.error("Error loading cofirmation page", error);
        res.redirect('/pageNotFound');
    }
}




const handleOrderRefund = async (userId, orderId, amount) => {

    try {
        if (!userId || !orderId || !amount) {
            throw new Error('Missing required parameters for refund');
        }

        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            wallet = new Wallet({
                userId: userId,
                balance: 0,
                transactions: []
            });
            await wallet.save();
        }

        const refundTransaction = {
            type: 'Refund',
            amount: amount,
            orderId: orderId,
            status: 'Completed',
            description: 'Order cancellation refund',
            date: new Date()
        };

        const updatedWallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $inc: { balance: parseFloat(amount) },
                $push: {
                    transactions: {
                        $each: [refundTransaction],
                        $position: 0
                    }
                },
                $set: { lastUpdated: new Date() }
            },
            {
                new: true,
                runValidators: true,
                upsert: true
            }
        );

        if (!updatedWallet) {
            throw new Error('Wallet update failed');
        }



        return {
            success: true,
            message: 'Refund processed successfully',
            newBalance: updatedWallet.balance
        };
    } catch (error) {
        console.error('Error processing refund:', error);
        throw error;
    }
};

const orderHistory = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments({ user: user });
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find({ user: user })
            .populate('orderedItems.product')
            .populate({
                path: 'address',
                model: 'Address',
                transform: doc => {
                    if (doc && doc.address && doc.address.length > 0) {
                        return doc.address.find(addr => addr._id.toString() === doc._id.toString());
                    }
                    return null;
                }
            })
            .populate('user', 'name email phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);


        res.render('order-details', {
            orders,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order history',
            error: error.message || 'Internal Server Error'
        });
    }
};


function recalculateOrderStatus(order) {
    if (!order.orderedItems || order.orderedItems.length === 0) {
        return order.status;
    }

    if (order.orderedItems.length === 1) {
        return order.orderedItems[0].status;
    }

    const statuses = order.orderedItems.map(item => item.status || "Pending");

    if (statuses.every(status => status === statuses[0])) {
        return statuses[0];
    }

    if (statuses.includes("Processing")) {
        return "Processing";
    }

    if (statuses.includes("Shipped") || statuses.includes("Delivered")) {

        if (statuses.includes("Delivered") && statuses.some(status => status !== "Delivered")) {
            return "Partially Delivered";
        }

        if (statuses.includes("Shipped")) {
            return "Shipped";
        }

        if (statuses.includes("Delivered")) {
            return "Delivered";
        }
    }

    if (statuses.includes("Cancelled")) {
        if (statuses.some(status => status !== "Cancelled")) {
            return "Partially Cancelled";
        }
        return "Cancelled";
    }

    if (statuses.includes("Returned")) {
        if (statuses.some(status => status !== "Returned")) {
            return "Partially Returned";
        }
        return "Returned";
    }

    return order.status;
}


function recalculatePaymentStatus(order) {
    const totalItems = order.orderedItems.length;
    const returnedOrCancelledItems = order.orderedItems.filter(item =>
        ['Returned', 'Cancelled'].includes(item.status)
    ).length;

    if (returnedOrCancelledItems === 0) {
        return 'Paid';
    } else if (returnedOrCancelledItems === totalItems) {
        return 'Refunded';
    } else {
        return 'Partially Refunded';
    }
}

const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId, cancelReason, cancelNote } = req.body;
        const userId = req.session.user;

        if (!orderId || !itemId || !cancelReason) {
            return res.status(400).json({
                success: false,
                message: "Order ID, item ID, and cancellation reason are required"
            });
        }

        const order = await Order.findById(orderId).populate('orderedItems.product');

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to cancel this order item" });
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in order" });
        }

        if (!['Pending', 'Processing'].includes(item.status)) {
            return res.status(400).json({
                success: false,
                message: "This item cannot be cancelled at this stage"
            });
        }

        if (item.status === "Cancelled") {
            return res.status(400).json({ success: false, message: "Item is already cancelled" });
        }

       
        item.status = "Cancelled";
        item.cancellation = {
            isCancelled: true,
            cancelledAt: new Date(),
            cancelReason,
            cancelNote: cancelNote || '',
            cancelledBy: 'user'
        };

        const product = await Product.findById(item.product._id);
        if (product) {
            const variant = product.variants.find(v => v._id.toString() === item.variantId);
            if (variant) {
                const sizeVariant = variant.sizes.find(s => s.size === item.size);
                if (sizeVariant) {
                    sizeVariant.stock += item.quantity;
                    await product.save();
                }
            }
        }

        if (order.paymentStatus === 'Paid') {
            const itemBaseAmount = item.price * item.quantity;
            const itemDiscountAmount = (item.discountAmount || 0) * item.quantity;
            const itemRefundAmount = itemBaseAmount - itemDiscountAmount;

            try {
                const refundResult = await handleOrderRefund(userId, orderId, itemRefundAmount);
                if (!refundResult.success) {
                    return res.status(500).json({ success: false, message: 'Failed to process refund' });
                }
            } catch (error) {
                console.error('Error processing refund:', error);
                return res.status(500).json({ success: false, message: 'Error processing refund' });
            }
        }

        order.totalPrice -= item.price * item.quantity;
        order.finalAmount -= (item.price * item.quantity - (item.discountAmount || 0) * item.quantity);

        order.status = recalculateOrderStatus(order);
        order.paymentStatus = recalculatePaymentStatus(order);

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Order item cancelled successfully",
            order
        });
    } catch (error) {
        console.error('Error in cancelOrderItem:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to cancel order item",
            error: error.message
        });
    }
};




const returnOrderItem = async (req, res) => {
    try {
        const { orderId, itemId, reason, note } = req.body;
        const userId = req.session.user;

        const order = await Order.findById(orderId).populate('orderedItems.product');

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in order" });
        }

        if (item.status !== "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Only delivered items can be returned"
            });
        }

        const itemBaseAmount = item.price * item.quantity;
        const itemDiscountAmount = (item.discountAmount || 0) * item.quantity;  
        const refundAmount = itemBaseAmount - itemDiscountAmount;


        const returnData = new Return({
            userId,
            orderId,
            itemId,
            reason,
            note,
            refundAmount,
            product: item.product,
            productName: item.product.productName,
            quantity: item.quantity,
            variant: {
                color: item.color,
                size: item.size
            }
        });

        await returnData.save();

        item.status = "Return Requested";
        item.returnRequested = true;
        item.returnDetails = { reason, note, requestedAt: new Date() };
        order.status = recalculateOrderStatus(order);
        order.paymentStatus = recalculatePaymentStatus(order);

        await order.save();

        res.status(200).json({
            success: true,
            message: "Return Request Submitted Successfully"
        });

    } catch (error) {
        console.error("Error processing return request:", error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong, please try again later.'
        });
    }
};



module.exports = {
    loadCheckout,
    getWalletBalance,
    placeOrderInitial,
    orderConfirm,
    handleOrderRefund,
    orderHistory,
    cancelOrderItem,
    returnOrderItem,
    recalculateOrderStatus,
    recalculatePaymentStatus
}