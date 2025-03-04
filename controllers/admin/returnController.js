const Return = require("../../models/returnSchema");
const Wallet = require("../../models/walletSchema");
const Order = require("../../models/orderSchema");
const Notification = require("../../models/notificationSchema");

const { recalculateOrderStatus } = require('../user/orderController');
const { recalculatePaymentStatus } = require('../user/orderController');




const getReturnApprovals = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = 6; 

        const totalReturns = await Return.countDocuments();
        const returns = await Return.find()
            .populate('userId')
            .populate({
                path: 'orderId',
                populate: {
                    path: 'orderedItems.product'
                }
            })
            .populate('product')
            .sort({ returnedAt: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize);

        res.render('returnOrder', {
            returns,
            currentPage: page,
            totalPages: Math.ceil(totalReturns / pageSize),
            hasPrevPage: page > 1,
            hasNextPage: page < Math.ceil(totalReturns / pageSize)
        });
    } catch (error) {
        console.error('Error fetching returns:', error);
        res.status(500).send('Internal Server Error');
    }
};



const returnUpdate = async (req, res) => {
    try {
        const returnId = req.query.id;
        const { status, comments } = req.body;

        if (!returnId) return res.status(400).send('Return ID is required');
        if (!['Approved', 'Rejected'].includes(status)) return res.status(400).send('Invalid status value');

        const returnData = await Return.findById(returnId).populate('orderId userId product');
        if (!returnData) return res.status(404).send('Return request not found');

        const { userId, orderId, itemId, product, quantity, variant } = returnData;

        const order = await Order.findById(orderId).populate('orderedItems.product');
        if (!order) return res.status(404).send('Order not found');

        const item = order.orderedItems.id(itemId);
        if (!item) return res.status(404).send('Item not found in order');

        if (status === 'Approved') {

            item.status = 'Returned';

            const itemBaseAmount = item.price * item.quantity;
            const itemDiscountAmount = (item.discountAmount || 0) * item.quantity; 
            const refundAmount = itemBaseAmount - itemDiscountAmount;

            
            const productDoc = item.product;
            const variantDoc = productDoc.variants.find(v => v.color === variant.color);

            if (variantDoc) {
                const sizeVariant = variantDoc.sizes.find(s => s.size === variant.size);
                if (sizeVariant) {
                    sizeVariant.stock += quantity;
                    await productDoc.save();
                } else {
                    console.warn(`Size ${variant.size} not found for product ${productDoc._id}`);
                }
            } else {
                console.warn(`Variant ${variant.color} not found for product ${productDoc._id}`);
            }

            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = new Wallet({
                    userId,
                    balance: refundAmount,
                    transactions: [{
                        type: 'Refund',
                        amount: refundAmount,
                        description: `Refund for ${product.productName} (${variant.size})`,
                        orderId,
                        date: new Date()
                    }]
                });
            } else {
                wallet.balance += refundAmount;
                wallet.transactions.push({
                    type: 'Refund',
                    amount: refundAmount,
                    description: `Refund for ${product.productName} (${variant.size})`,
                    orderId,
                    date: new Date()
                });
            }
            await wallet.save();

            returnData.status = 'Approved';
            returnData.approvedAt = new Date();
            returnData.comments = comments;
            returnData.refundAmount = refundAmount;  
            await returnData.save();

            await Notification.create({
                userId,
                message: `Your return for ${product.productName} (${variant.size}) has been approved. Refund of ₹${refundAmount.toFixed(2)} added to wallet.`,
                status: 'unread',
                createdAt: new Date()
            });

        } else if (status === 'Rejected') {
            returnData.status = 'Rejected';
            returnData.rejectedAt = new Date();
            returnData.comments = comments;
            await returnData.save();

            await Notification.create({
                userId,
                message: `Your return for ${product.productName} (${variant.size}) has been rejected.`,
                status: 'unread',
                createdAt: new Date()
            });
        }

        order.status = recalculateOrderStatus(order);
        order.paymentStatus = recalculatePaymentStatus(order);  
        await order.save();

        res.redirect('/admin/return-approvals');

    } catch (error) {
        console.error('Error in return update:', error);
        res.status(500).send('Internal server error');
    }
};




module.exports = {
    getReturnApprovals,
    returnUpdate
};