
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Return = require('../../models/returnSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');


const loadCheckout = async (req, res) => {
    try {
        console.log("[INFO] Checkout process initiated.");
        const user = req.session.user;
        console.log("[INFO] User session retrieved:", user);

        const addressDoc = await Address.findOne({ userId: user });
        const addresses = addressDoc ? addressDoc.address : [];
        console.log("[INFO] User addresses retrieved:", addresses);

        let totalPrice = 0;
        const productId = req.query.id;
        console.log("[INFO] Product ID from query:", productId);

        const availableCoupons = await Coupon.find({
            expireOn: { $gt: new Date() },
            isList: true
        });
        console.log("[INFO] Available coupons fetched:", availableCoupons);

        if (productId) {
            console.log("[INFO] Single product checkout detected.");
            
            const product = await Product.findOne({ _id: productId });
            if (!product) {
                console.log("[ERROR] Product not found for ID:", productId);
                return res.status(400).json({ message: "Product not found" });
            }
            console.log("[INFO] Product details retrieved:", product);

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
            console.log("[INFO] Structured product data:", structuredProduct);

            totalPrice = structuredProduct.totalPrice;
            console.log("[INFO] Total price calculated:", totalPrice);

            return res.render('checkout', {
                cart: null,
                products: null,
                address: addresses,
                totalPrice,
                product: structuredProduct,
                availableCoupons: availableCoupons
            });

        } else {
            console.log("[INFO] Cart checkout detected.");
            
            const cartItems = await Cart.findOne({ userId: user }).populate('items.productId');
            if (!cartItems) {
                console.log("[ERROR] Cart not found for user:", user);
                return res.status(400).json({ success: false, message: "Cart is empty" });
            }
            if (cartItems.items.length === 0) {
                console.log("[INFO] Cart is empty. Redirecting to home page.");
                return res.redirect('/');
            }
            console.log("[INFO] Cart items retrieved:", cartItems.items);

            totalPrice = cartItems.items.reduce((sum, item) => sum + item.totalPrice, 0);
            console.log("[INFO] Total cart price calculated:", totalPrice);

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

        const order = new Order({
            orderedItems,
            totalPrice,
            discount,
            finalAmount: Number(finalPrice),
            user: userId,
            address: addressId,
            status: 'Pending',
            paymentMethod: payment_method,
            paymentStatus: 'Pending',
            couponCode: coupon || 'N/A',
            couponApplied: Boolean(coupon && discount)
        });

        await order.save();

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

        const order = await Order.findById(orderId).populate('orderedItems.product');

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

        for (const item of order.orderedItems) {
            const product = item.product;
            const variant = product.variants.find(v => v._id.toString() === item.variantId);
            if (variant) {
                const sizeVariant = variant.sizes.find(s => s.size === item.size);
                if (sizeVariant) {
                    sizeVariant.stock += item.quantity;
                    await product.save();
                }
            }
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

        console.log('Populated orders:', JSON.stringify(orders[0], null, 2));

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
        handleError(res, error, 'Error fetching order history');
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
    loadCheckout,
    placeOrderInitial,
    orderConfirm,
    cancelOrder,
    handleOrderRefund,
    orderHistory,
    returnOrder
}