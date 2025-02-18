const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Address = require('../../models/addressSchema');
const PDFDocument = require('pdfkit');
const Return = require('../../models/returnSchema');
const Wallet = require('../../models/walletSchema');
const ExcelJS = require('exceljs');
const Product = require('../../models/productSchema');




const loadOrders = async(req,res)=>{
    const { status } = req.query;

    const filter = status && status !== 'All' ? { status } : {};

    try {
        const limit = 10;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const orders = await Order.find(filter)
            .populate('user')
            .populate('address')
            .populate({
                path: 'orderedItems.product', 
                model: 'Product', 
                select: 'productName productImage', 
                strictPopulate: false 
            })
            .sort({createdAt:-1})
            .limit(limit)
            .skip((page - 1) * limit);
          
            
        const totalCount = await Order.countDocuments(filter);
        res.render('orders-list', { 
            orders: orders.reverse(), 
            currentStatus: status || 'All',
            totalPages: Math.ceil(totalCount/limit), 
            currentPage: page 
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('page-404', { 
            message: 'Error retrieving orders', 
            errorCode: 500,
            error: error 
        });
    }
}



const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, newStatus, cancellation } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        order.status = newStatus;

        if (newStatus === "Cancelled" && cancellation) {
            order.cancellation = {
                isCancelled: true,
                cancelledAt: new Date(),
                cancelReason: cancellation.cancelReason || '',
                cancelNote: cancellation.cancelNote || '',
                cancelledBy: cancellation.cancelledBy || 'admin',
            };
        }

        await order.save();

        res.status(200).json({ success: true, message: "Order status updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};





module.exports={
    loadOrders,
    updateOrderStatus
}