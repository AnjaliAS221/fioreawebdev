const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');




const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

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

        console.log('receipt', receipt);

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

const placeOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, paymentDetails, paymentSuccess } = req.body;
        console.log(req.body);
        
        
        const order = await Order.findById(orderId)
            .populate("orderedItems.product")
            .session(session);
            
        if (!order) {
            throw new Error('Order not found');
        }

        if (paymentSuccess) {
            
            await validateAndUpdateStock(order.orderedItems, true, session);
            
            order.paymentStatus = 'Paid';
            order.status = 'Processing';
            if (paymentDetails) {
                order.paymentDetails = paymentDetails;
            }
            
            await order.save({ session });
            await session.commitTransaction();
            
            return res.status(200).json({
                success: true,
                message: 'Order placed successfully',
                orderId: order._id,
            });
        } else {
            throw new Error('Payment failed');
        }
    } catch (error) {
        await session.abortTransaction();
        console.error("Error processing order:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to process the order'
        });
    } finally {
        session.endSession();
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

const validateAndUpdateStock = async (products) => {
    try {
        if (!products || products.length === 0) {
            console.error("No products provided for stock validation.");
            return false;
        }

        const productIds = products.map(item => item.productId);
        console.log("Fetching product IDs:", productIds);

        const productData = await Product.find({ _id: { $in: productIds } });
        if (!productData.length) {
            console.error("No products found for given IDs:", productIds);
            return false;
        }

        const productMap = new Map(productData.map(prod => [prod._id.toString(), prod]));
        console.log("Product Map:", productMap);

        for (const item of products) {
            const productId = item.productId?.toString();
            if (!productId || !productMap.has(productId)) {
                console.error("Product not found in productMap:", productId);
                return false;
            }

            const product = productMap.get(productId);
            if (!product || product.stock < item.quantity) {
                console.error("Insufficient stock for product:", productId);
                return false;
            }
        }

        for (const item of products) {
            const product = productMap.get(item.productId.toString());
            product.stock -= item.quantity;
            await product.save();
        }
        
        return true;
    } catch (error) {
        console.error("Error in validateAndUpdateStock:", error);
        return false;
    }
};

const paymentFailed = async (req, res) => {
    try {
        const orderId = req.query.id;
        const error = req.query.error || 'An error occurred during payment';

       
        if (!orderId) {
            console.error("Missing orderId in query parameters.");
            return res.redirect('/cart');
        }

        
        const order = await Order.findById(orderId).populate('orderedItems.product').lean();


        if (!order) {
            console.error(`Order not found for ID: ${orderId}`);
            return res.status(404).render('error', {
                message: 'Order not found',
                error: 'The requested order could not be found'
            });
        }

      
        if (order.paymentStatus !== 'Failed') {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'Failed',
                status: 'Payment Failed',
                lastError: decodeURIComponent(error)
            });
        }

      
        const formattedOrder = {
            _id: order._id,
            totalAmount: order.finalAmount || 0, 
            orderedItems: order.orderedItems || [],
            createdAt: order.createdAt || new Date(),
            paymentMethod: order.paymentMethod || 'Unknown'
        };

        
        return res.render('paymentFail', {
            error: decodeURIComponent(error),
            order: formattedOrder,
            orderId: orderId,
            title: 'Payment Failed',
            user: req.session?.user || null
        });

    } catch (err) {
        console.error('Error in payment failed page:', err);
        return res.status(500).render('page-404', {
            message: 'Something went wrong. Please try again later.',
            error: err.message
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
                name: order.user.name,  
                email: order.user.email,  
                phone: order.user.phone
            }
        });
    } catch (error) {
        console.error('Error in retry-payment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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

     
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        order.paymentError = {
            message: error,
            details: paymentError,
            failureType: status,
            timestamp: new Date()
        };

        if (order.orderedItems && order.orderedItems.length > 0) {
            for (const item of order.orderedItems) {
                const product = await Product.findById(item.product);
                if (product) {
                    
                    const variant = product.variants.find(v => 
                        v._id.toString() === item.variantId.toString()
                    );
                    
                    if (variant) {
                        const sizeToUpdate = variant.sizes.find(s => 
                            s._id.toString() === item.sizeId.toString()
                        );
                        
                        if (sizeToUpdate) {
                            sizeToUpdate.stock += item.quantity;
                        }
                    }
                    
                    await product.save();
                }
            }
        }

        if (order.couponCode) {
            await Coupon.findOneAndUpdate(
                { name: order.couponCode },
                { $pull: { userId: order.user } }
            );
        }

        await order.save();
        console.log("Order payment status before update:", order.paymentStatus);

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


module.exports = {
    createOrder,
    verifyPayment,
    validateAndUpdateStock,
    paymentFailed,
    placeOrder,
    retryPayment,
    updateFailedOrder,
    
}