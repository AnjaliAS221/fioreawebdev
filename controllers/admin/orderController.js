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


const restockOnOrderCancellation = async (order) => {
    const { orderedItems, status, cancellation } = order;

    if (status === "Cancelled" && cancellation.isCancelled) {
        for (const item of orderedItems) {
            const product = await Product.findById(item.product);
            if (!product) continue;

            const variant = product.variants.id(item.variantId);
            if (variant) {
                variant.stock += item.quantity; 
                await product.save();
            }
        }
    }
};


const manageStockOnOrder = async (order) => {
    const { orderedItems, status } = order;

    if (status === "Pending" || status === "Processing") {
        for (const item of orderedItems) {
            const product = await Product.findById(item.product);
            if (!product) continue;

            const variant = product.variants.id(item.variantId);
            if (variant && variant.stock >= item.quantity) {
                variant.stock -= item.quantity; 
                await product.save();
            } else {
                throw new Error(`Insufficient stock for product: ${product.productName}`);
            }
        }
    }
};


const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, newStatus, cancellation} = req.body;
        console.log(newStatus);
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        order.status = newStatus;
        if (cancellation) {
            order.cancellation = cancellation;
        }
        await order.save();

        if (newStatus === "Cancelled") {
            await restockOnOrderCancellation(order);
        } else if (newStatus === "Pending" || newStatus === "Processing") {
            await manageStockOnOrder(order);
        }

        res.status(200).json({success:true, message: "Order updated successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};


const getReturnPage= async (req,res)=>{
    try {
        const limit =5;
        
        const page= Math.max(1,parseInt(req.query.page))||0
        const skip= (page-1)/limit
        const returnData=await Return.find().populate('userId').populate('orderId').sort({createdAt:-1}).limit(limit).skip(skip);

        console.log(returnData);
        const count =await Return.countDocuments();
        res.render('returnOrder',{returns:returnData,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        })

    } catch (error) {
        console.error(error);
        res.redirect('/pageeorror')
    }
}
const returnRequest= async (req,res)=>{
    try {
        const status=req.body.status;
        const returnId=req.query.id;

        const returnData = await Return.findById(returnId);
        if(!returnData){
            return res.json({message:'return id not found'})

        }
        const orderId=returnData.orderId;
        const userId=returnData.userId;
        const amount=returnData.refundAmount;
        console.log(orderId);

        if(status=='approved'){
            const wallet=await Wallet.findOneAndUpdate({userId},{$inc:{balance:amount},$push:{transactions:{type:'Refund',amount,orderId,description:'Refund for your returned product'}}})
            returnData.returnStatus ='approved';
            await returnData.save();
            await Order.findByIdAndUpdate(orderId,{$set:{status:'Returned'}})

        }else if(status=='rejected'){
            returnData.returnStatus =status;
            await returnData.save();
            await Order.findByIdAndUpdate(orderId,{$set:{status:'Return Requeest'}})

        }else{
            return res.status(400).json({message:'something wend wrong'})
        }
        res.redirect('/admin/getReturnRequest')


    } catch (error) {
        res.redirect('/admin/pageerror')
        
    }
}



module.exports={
    loadOrders,
    updateOrderStatus,
    getReturnPage,
    returnRequest,
}