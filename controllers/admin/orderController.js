const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Address = require('../../models/addressSchema');
const PDFDocument = require('pdfkit');
const Return = require('../../models/returnSchema');
const Wallet = require('../../models/walletSchema');
const ExcelJS = require('exceljs');
const Product = require('../../models/productSchema');

const { recalculateOrderStatus } = require('../user/orderController');
const { recalculatePaymentStatus } = require('../user/orderController');


const loadOrders = async (req, res) => {
    const { status } = req.query;

    try {
        const limit = 10;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        let orders = await Order.find({})
            .populate('user')
            .populate('address')
            .populate({
                path: 'orderedItems.product',
                model: 'Product',
                select: 'productName productImage',
                strictPopulate: false
            })
            .sort({ createdAt: -1 });

        let filteredOrders = [];

        orders.forEach(order => {
            let filteredItems = order.orderedItems;

            if (status && status !== 'All') {
                filteredItems = filteredItems.filter(item => item.status === status);
            }

            if (filteredItems.length > 0 || !status || status === 'All') {
                filteredOrders.push({
                    orderId: order._id,
                    createdAt: order.createdAt,
                    userName: order.user ? order.user.name : 'Unknown',
                    paymentMethod: order.paymentMethod,
                    paymentStatus: order.paymentStatus,
                    finalAmount: order.finalAmount,
                    couponCode: order.couponCode,
                    discount: order.discount,
                    status: order.status,
                    orderedItems: filteredItems.map(item => ({
                        _id: item._id,
                        productName: item.product?.productName || 'Unknown Product',
                        productImage: item.product?.productImage || [],
                        quantity: item.quantity,
                        price: item.price,
                        status: item.status,
                        size: item.size,
                        color: item.color
                    }))
                });
            }
        });

        const totalOrders = filteredOrders.length;
        const totalPages = Math.ceil(totalOrders / limit);

        const paginatedOrders = filteredOrders.slice((page - 1) * limit, page * limit);

        res.render('orders-list', {
            groupedOrders: paginatedOrders,
            currentStatus: status || 'All',
            totalPages: totalPages,
            currentPage: page
        });

    } catch (error) {
        console.error('Error fetching grouped orders:', error);
        res.status(500).render('page-404', {
            message: 'Error retrieving orders',
            errorCode: 500,
            error: error
        });
    }
};


const updateItemStatus = async (req, res) => {


    const { orderId, itemId, status } = req.body;
    const allowedTransitions = {
        Pending: ['Processing', 'Cancelled', 'Shipped'],
        Processing: ['Shipped', 'Cancelled'],
        Shipped: ['Delivered', 'Return Requested'],
        Delivered: ['Return Requested', 'Returned'],
        'Return Requested': ['Returned', 'Cancelled'],
        Cancelled: [],
        Returned: []
    };



    try {
        const order = await Order.findById(orderId).populate('user').populate('orderedItems.product');
        if (!order) return res.json({ success: false, message: "The order you are trying to update was not found." });

        const item = order.orderedItems.id(itemId);
        if (!item) return res.json({ success: false, message: 'The item you are trying to update does not exist in this order.' });

        const currentStatus = item.status;
        const isValidTransition = allowedTransitions[currentStatus]?.includes(status);

        if (!isValidTransition) {
            return res.json({
                success: false,
                message: `"You cannot change the status from ${currentStatus} to ${status}. Please follow the correct order process."`
            });
        }

        item.status = status;

        const shouldRestock = (status === 'Cancelled' || status === 'Returned') &&
            (currentStatus !== 'Cancelled' && currentStatus !== 'Returned');

        if (shouldRestock && item.product) {
            const product = item.product;
            const variant = product.variants.find(v => v._id.toString() === item.variantId);
            if (variant) {
                const sizeVariant = variant.sizes.find(s => s.size === item.size);
                if (sizeVariant) {
                    sizeVariant.stock += item.quantity;
                    await product.save();
                } else {
                    console.warn(`Size variant ${item.size} not found for product ${product._id}`);
                }
            } else {
                console.warn(`Variant not found for product ${product._id}`);
            }
        }

        const isRefundable = (status === 'Cancelled' || status === 'Returned') &&
            ['Online', 'Wallet'].includes(order.paymentMethod);

        if (isRefundable) {
            const itemBaseAmount = item.price * item.quantity;
            const itemDiscountAmount = (item.discountAmount || 0) * item.quantity;
            const refundAmount = itemBaseAmount - itemDiscountAmount;

            let wallet = await Wallet.findOne({ userId: order.user._id });

            if (!wallet) {
                wallet = new Wallet({
                    userId: order.user._id,
                    balance: refundAmount,
                    transactions: [{
                        type: 'Refund',
                        amount: refundAmount,
                        description: `Refund for ${item.product.productName} - Size: ${item.size}`,
                        orderId,
                        date: new Date()
                    }]
                });
            } else {
                wallet.balance += refundAmount;
                wallet.transactions.push({
                    type: 'Refund',
                    amount: refundAmount,
                    description: `Refund for ${item.product.productName} - Size: ${item.size}`,
                    orderId,
                    date: new Date()
                });
            }

            await wallet.save();
            console.log(`Refunded ₹${refundAmount} to user wallet for ${item.product.productName}`);
        }


        order.status = recalculateOrderStatus(order);
        order.paymentStatus = recalculatePaymentStatus(order);
        await order.save();

        res.json({ success: true, message: 'Item status updated successfully.' });

    } catch (err) {
        console.error('Error updating item status:', err);
        res.json({ success: false, message: 'Something went wrong while updating the order.  Please try again later or contact support if the issue persists.' });
    }
};


module.exports = {
    loadOrders,
    updateItemStatus,
}