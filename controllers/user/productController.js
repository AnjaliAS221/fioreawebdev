
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const Return = require('../../models/returnSchema');
const Wallet = require('../../models/walletSchema')
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');




const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});




const handleError = (res, error, customMessage = 'An error occurred') => {
    console.error(customMessage, error);
    res.status(500).render('page-404', { message: customMessage });
};

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('the userId', userId);
        const userData = await User.findById(userId);
        console.log('The userData', userData);

        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;

        const categoryOffer = findCategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        const colors = product.colors || [];
        const sizes = product.sizes || [];

        res.render("product-details", {
            user: userData,
            product: product,
            quantity: product.quantity,
            totalOffer: totalOffer,
            category: findCategory,
            colors: colors,
            sizes: sizes
        });
    } catch (error) {
        console.error("Error  fetching product details", error);
        res.redirect("/pageNotFound");
    }
}

const getAllProducts = async (req, res) => {
    try {
        const limit = 16;
        const page = Math.max(1, parseInt(req.query.page) || 1);

        const [products, count, categories] = await Promise.all([
            Product.find({ isBlocked: false })
                .limit(limit)
                .skip((page - 1) * limit),
            Product.countDocuments(),
            Category.find({ isListed: false })
        ]);

        const totalPages = Math.ceil(count / limit);

        res.render('all-products', {
            products,
            categories,
            totalPages,
            currentPage: page
        });
    } catch (error) {
        handleError(res, error, 'Error loading all products');
    }
};

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
            const product = await Product.findOne({ _id: productId, });

            if (!product) {
                return res.status(400).json({ message: "Product not found" });
            }

            totalPrice = product.salePrice;

            return res.render('checkout', {
                cart: null,
                products: null,
                address: addresses,
                totalPrice,
                totalPrice, product: product,
                availableCoupons: availableCoupons
            })

        } else {
            const cartItems = await Cart.findOne({ userId: user }).populate('items.productId');
            if (!cartItems) {

                return res.status(400).json({ success: false, message: "cart is empty" });
            }
            if (cartItems.items == []) {
                return res.redirect('/')
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
        console.error("Checkout load error:", error);
        res.redirect('/pageNotFound');
    }
};



const applyCoupon = async (req, res) => {
    try {
        let { couponCode, totalPriceAmt } = req.body;
        console.log(req.body);
        const userId = req.session.user;
        totalPriceAmt = Number(totalPriceAmt)

        const coupon = await Coupon.findOne({
            name: couponCode,
            expireOn: { $gt: new Date() },
            isList: true,
            minimumPrice: { $lte: totalPriceAmt }
        });

        if (!coupon) {
            return res.json({
                success: false,
                message: 'Invalid or expired coupon'
            });
        }


        const couponUsageCount = await Order.countDocuments({
            user: userId,
            'couponApplied.couponId': coupon._id
        });

        if (couponUsageCount >= coupon.usageLimit) {
            return res.json({
                success: false,
                message: 'Coupon usage limit exceeded'
            });
        }

        const discountedPrice = Math.max(
            totalPriceAmt - coupon.offerPrice,
            0
        );
        console.log(discountedPrice);

        return res.json({
            success: true,
            message: 'Coupon applied successfully',
            originalPrice: totalPriceAmt,
            discountedPrice: discountedPrice,
            couponDiscount: coupon.offerPrice,
            couponCode: couponCode,
        });
    } catch (error) {
        console.error('Coupon application error:', error);
        res.status(500).json({
            success: false,
            message: 'Error applying coupon'
        });
    }
}
const placeOrderInitial = async (req, res) => {
    try {
        const { cart, totalPrice, addressId, singleProduct, payment_method, finalPrice, coupon, discount } = req.body;
        console.log(totalPrice);

        const userId = req.session.user;

        const parsedTotalPrice = Number(totalPrice);
        if (isNaN(parsedTotalPrice)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing totalPrice' });
        }
        console.log("totalprice:", req.body);

        let orderedItems = [];
        if (singleProduct) {
            const product = JSON.parse(singleProduct);
            orderedItems.push({
                product: product._id,
                quantity: 1,
                price: product.salePrice,
            });
            await Product.findByIdAndUpdate(product._id, {
                $inc: { quantity: -1 }
            });
            console.log(product);

        } else if (cart) {
            const cartItems = JSON.parse(cart);
            orderedItems = cartItems.map(item => ({
                product: item.productId,
                quantity: item.quantity,
                price: item.totalPrice / item.quantity,
            }));
            for (const item of cartItems) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.quantity } });
            }

        }

        const addressDoc = await Address.findOne({ userId });
        const address = addressDoc.address.find(addr => addr._id.toString() === addressId);

        const newOrder = new Order({
            orderedItems,
            totalPrice,
            discount: discount,
            finalAmount: Number(finalPrice),
            user: userId,
            address: address,
            status: 'Pending',
            paymentMethod: payment_method,
            paymentStatus: 'Pending',
            couponCode: coupon,
            couponApplied: Boolean(coupon && discount)
        });

        if (coupon) {
            await Coupon.findOneAndUpdate(
                { name: coupon },
                { $push: { userId: userId } }
            );

        }
        const cartempty = await Cart.findOne({ userId })
        cartempty.items = []
        await cartempty.save()


        await newOrder.save();
        res.status(200).json({ success: true, orderId: newOrder._id, key: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
        console.error("Error placing initial order:", error);
        res.status(500).json({ success: false, message: 'Failed to save order. Please try again.' });
    }
};


const createOrder = async (req, res) => {
    try {
        const { amount, addressId } = req.body;
        const userId = req.session.user;
        console.log(req.body);

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            console.log('not 1');
            return res.status(400).json({
                success: false,
                message: 'Invalid amount. Amount must be a positive number'
            });
        }

        if (!addressId) {
            console.log('not 12');
            return res.status(400).json({
                success: false,
                message: 'Delivery address is required'
            });
        }

        if (!userId) {
            console.log('not 13');
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const amountInPaise = Math.round(amount * 100);



        const receipt = crypto
            .randomBytes(16)
            .toString('hex');

        console.log('recept', receipt);

        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt,
            notes: {
                userId: userId.toString(),
                addressId: addressId.toString()
            },
            payment_capture: 1,
        };


        const razorpayOrder = await razorpay.orders.create(options);

        req.session.razorpayOrderId = razorpayOrder.id;
        req.session.razorpayOrderExpiry = Date.now() + (30 * 60 * 1000);

        res.status(200).json({
            success: true,
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            receipt: razorpayOrder.receipt
        });

    } catch (error) {
        console.error('Razorpay order creation error:', error);


        if (error.error) {
            switch (error.error.code) {
                case 'BAD_REQUEST_ERROR':
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid request parameters',
                        error: error.error.description
                    });
                case 'GATEWAY_ERROR':
                    return res.status(502).json({
                        success: false,
                        message: 'Payment gateway error',
                        error: 'Unable to process payment at this time'
                    });
                default:
                    return res.status(500).json({
                        success: false,
                        message: 'Payment initialization failed',
                        error: error.error.description
                    });
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
};


const updateFailedOrder = async (req, res) => {
    try {
        const { orderId, status, error, paymentError } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Update order status
        order.paymentStatus = 'Failed';
        order.paymentError = {
            message: error,
            details: paymentError,
            failureType: status,
            timestamp: new Date()
        };

        if (order.orderedItems && order.orderedItems.length > 0) {
            for (const item of order.orderedItems) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { quantity: item.quantity } }
                );
            }
        }

        await order.save();

        if (order.couponCode) {
            await Coupon.findOneAndUpdate(
                { name: order.couponCode },
                { $pull: { userId: order.user } }
            );
        }

        res.json({
            success: true,
            message: 'Order marked as failed'
        });
    } catch (error) {
        console.error('Failed to update order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status'
        });
    }
};



const placeOrder = async (req, res) => {
    try {
        const { orderId, paymentDetails, paymentSuccess } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (paymentSuccess) {
            order.paymentStatus = 'Paid';
        } else {
            order.paymentStatus = 'Pending';
        }

        if (paymentDetails) {
            order.paymentDetails = paymentDetails;
        }

        await order.save();

        res.status(200).json({
            success: true,
            message: `Order ${paymentSuccess ? 'Paid' : 'pending due to payment failure'}`,
            orderId: order._id
        });
    } catch (error) {
        console.error("Error updating order payment status:", error);
        res.status(500).json({ success: false, message: 'Failed to update order. Please try again.' });
    }
};


const orderConfirm = async (req, res) => {
    try {

        const id = req.query.id
        const order = await Order.findById(id);
        res.render('order-confirmation', { order });

    } catch (error) {
        console.error("Error loading cofirmation page", error);
        res.redirect('/page-not-found');
    }
}

const cancelOrder = async (req, res) => {
    try {
        const { orderId, cancelReason, cancelNote } = req.body;
        const userId = req.session.user;

        if (!orderId || !cancelReason) {
            return res.status(400).json({
                success: false,
                message: "Order ID and cancellation reason are required"
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.status !== 'Pending' && order.status !== 'Processing') {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be cancelled at this stage'
            });
        }

        if (order.paymentStatus === 'Paid') {
            const refundAmount = order.finalAmount || 0;
            const refundResult = await handleOrderRefund(userId, orderId, refundAmount);

            if (!refundResult.success) {
                throw new Error('Refund processing failed');
            }

            order.paymentStatus = 'Refunded';
            order.refundDetails = {
                refundedAt: new Date(),
                refundAmount: refundAmount,
                refundStatus: 'Completed',
                refundedToWallet: true
            };
        }

        order.status = 'Cancelled';
        order.cancellation = {
            isCancelled: true,
            cancelledAt: new Date(),
            cancelReason,
            cancelNote: cancelNote || '',
            cancelledBy: 'user'
        };

        await order.save();
        res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            order
        });
    } catch (error) {
        console.error('Error in cancelOrder:', error);
        res.status(500).json({
            success: false,
            message: "Failed to cancel order"
        });
    }
};

const orderHistory = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const orders = await Order.find({ user: user })
            .populate(['orderedItems.product', 'address'])
            .sort({ createdAt: -1 });
        res.render('order-details', {
            orders,
        });
    } catch (error) {
        handleError(res, error, 'Error fetching order history');
    }
};



const removeCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user;

        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }


        const coupon = await Coupon.findOne({ name: couponCode });
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }


        cart.couponApplied = null;
        cart.couponDiscount = 0;
        await cart.save();


        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

        return res.json({
            success: true,
            message: 'Coupon removed successfully',
            totalPrice: totalPrice,
            couponDiscount: 0,
            finalAmount: totalPrice
        });
    } catch (error) {
        console.error('Remove coupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing coupon',
            error: error.message
        });
    }
};

const loadCoupons = async (req, res) => {
    try {
        const userId = req.session.user;

        const availableCoupons = await Coupon.find({
            expireOn: { $gt: new Date() },
            isList: true,
            minimumPrice: { $exists: true }
        });
        console.log('Available coupons before filtering:', availableCoupons.length);

        const usedCouponIds = await Order.distinct('couponApplied.couponId', { user: userId });
        console.log('Used coupon IDs:', usedCouponIds);

        const filteredCoupons = availableCoupons.filter(coupon =>
            !usedCouponIds.includes(coupon._id)
        );

        console.log('Filtered coupons after removing used ones:', filteredCoupons.length);

        const couponData = filteredCoupons.map(coupon => ({
            name: coupon.name,
            offerPrice: coupon.offerPrice,
            minimumPrice: coupon.minimumPrice,
            expireOn: coupon.expireOn,
            description: coupon.description || 'No description available'
        }));

        console.log('Final coupon data:', couponData);


        console.log('Rendering view with data, view name:', 'coupon-list');

        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.json({
                success: true,
                coupons: couponData
            });
        }


        return res.render('coupon-list', {
            coupons: couponData,
            title: 'Available Coupons'
        });
    } catch (error) {
        console.error('Load coupons error:', error);


        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Error loading coupons',
                error: error.message
            });
        }

        return res.status(500).render('error', {
            message: 'Unable to load coupons',
            error: error
        });
    }
};



const retryPayment = async (req, res) => {
    const { orderId } = req.body;

    try {

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }


        const razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });


        const razorpayOrder = await razorpayInstance.orders.create({
            amount: order.finalAmount * 100,
            currency: "INR",
            receipt: `receipt_${orderId}`,
            notes: { orderId: orderId }
        });

        res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            amount: razorpayOrder.amount,
            orderId: razorpayOrder.id,
            customer: {
                name: order.customerName,
                email: order.customerEmail,
                phone: order.customerPhone
            }
        });
    } catch (error) {
        console.error('Error in retry-payment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const verifyPayment = async (req, res) => {
    const { orderId, paymentId, razorpayOrderId, signature } = req.body;

    try {
        console.log("Verifying payment for orderId:", orderId);
        console.log("Payment details received:", {
            paymentId,
            razorpayOrderId,
            signature
        });

        const order = await Order.findById(orderId);
        if (!order) {
            console.log("Order not found with _id:", orderId);
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.paymentStatus === 'Paid') {
            return res.json({
                success: true,
                message: 'Payment already verified and processed'
            });
        }

        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(`${razorpayOrderId}|${paymentId}`);
        const generatedSignature = hmac.digest('hex');

        try {
            const razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });
            const payment = await razorpay.payments.fetch(paymentId);

            if (payment.status === 'captured' && payment.order_id === razorpayOrderId) {

                order.status = 'Pending';
                order.paymentStatus = 'Paid';
                order.razorpayPaymentId = paymentId;
                order.razorpayOrderId = razorpayOrderId;
                order.paymentDetails = {
                    paymentId: paymentId,
                    orderId: razorpayOrderId,
                    signature: signature,
                    verifiedAt: new Date()
                };

                await order.save();

                return res.json({
                    success: true,
                    message: 'Payment verified and order updated successfully'
                });
            }
        } catch (razorpayError) {
            console.error('Razorpay API error:', razorpayError);
        }

        console.log(generatedSignature, signature);

        if (generatedSignature === signature) {

            const order = await Order.findById(orderId);

            if (!order) {
                console.log("Order not found with _id:", orderId);
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            order.status = 'Pending';
            order.paymentStatus = 'Paid';
            order.razorpayPaymentId = paymentId;
            order.razorpayOrderId = razorpayOrderId;
            order.paymentDetails = {
                paymentId: paymentId,
                orderId: razorpayOrderId,
                signature: signature,
                verifiedAt: new Date()
            };

            await order.save();

            res.json({
                success: true,
                message: 'Payment verified and order updated successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment verification failed - Invalid signature'
            });
        }
    } catch (error) {
        console.error('Error in verify-payment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during payment verification',
            error: error.message
        });
    }
};




const handleOrderRefund = async (userId, orderId, amount) => {
    console.log(userId, orderId, amount);
    try {
        if (!userId || !orderId || !amount) {
            throw new Error('Missing required parameters for refund');
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
                runValidators: true
            }
        );

        if (!updatedWallet) {
            throw new Error('Wallet not found or update failed');
        }

        console.log('Refund processed:', {
            userId,
            orderId,
            amount,
            newBalance: updatedWallet.balance
        });

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

const returnOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const userId = req.session.user;

        const orderData = await Order.findById(orderId);
        if (!orderData) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const existingReturn = await Return.findOne({ orderId });
        if (existingReturn) {
            return res.status(400).json({ success: false, message: 'Return request already submitted for this order' });
        }

        const reasonData = new Return({
            userId,
            orderId,
            reason,
            refundAmount: orderData.finalAmount,
        });

        await reasonData.save();

        return res.status(200).json({ success: true, message: "Return Request Submitted Successfully" });

    } catch (error) {
        console.error("Error processing return request:", error);
        return res.status(500).json({ success: false, message: 'Something went wrong, please try again later.' });
    }
};

module.exports = {
    productDetails,
    loadCheckout,
    getAllProducts,
    placeOrderInitial,
    orderConfirm,
    cancelOrder,
    orderHistory,
    applyCoupon,
    removeCoupon,
    loadCoupons,
    updateFailedOrder,
    createOrder,
    verifyPayment,
    placeOrder,
    retryPayment,
    returnOrder
}