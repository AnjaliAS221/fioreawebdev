const PDFDocument = require('pdfkit');
const moment = require('moment');
const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const generateInvoice = async (req, res) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    let orderId;
    
    try {
        orderId = req.params.orderId;
        console.log("Processing order ID:", orderId);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            throw new Error('Invalid Order ID format');
        }

        const order = await Order.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        if (order.status !== 'Delivered') {
            return res.status(403).json({
                error: 'Invoice unavailable',
                message: 'Invoice can only be generated for delivered orders'
            });
        }

        await order.populate([
            {
                path: 'orderedItems.product',
                select: 'productName price'
            }
        ]);

        const addressDoc = await Address.findOne({userId:req.session.user})
        const address = addressDoc.address.find(addr => addr._id.toString() === order.address.toString())
        console.log(address);
      
        console.log("Address population result:", {
            hasAddress: !!order.address,
            addressId: order.address?._id,
            addressDetails: order.address
        });

  
        if (!order.address) {
            throw new Error('Address not found for the order');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice_${order.orderId || orderId}.pdf`);
       
        doc.pipe(res);

        doc.fillColor('#f4f4f4')
            .rect(50, 50, 500, 50)
            .fill();

        doc.fillColor('#800000')
            .fontSize(25)
            .font('Helvetica-Bold')
            .text('Fiorea', 50, 65, { align: 'center' });

        doc.fontSize(10)
            .font('Helvetica')
            .fillColor('#666666')
            .text('Wear the Art of Flowers', 50, 95, { align: 'center' });

        doc.fillColor('#333333')
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('INVOICE', 50, 140);

        const displayOrderId = order.orderId || orderId;
        
        doc.font('Helvetica')
            .fontSize(10)
            .fillColor('#666666')
            .text(`Invoice Number: INV-${displayOrderId.slice(-8).toUpperCase()}`, 50, 160)
            .text(`Date: ${moment(order.createdAt).format('DD/MM/YYYY')}`, 50, 175)
            .text(`Payment Method: ${order.paymentMethod}`, 50, 190)
            .text(`Payment Status: ${order.paymentStatus}`, 50, 205);

        doc.font('Helvetica-Bold')
            .fontSize(12)
            .fillColor('#333333')
            .text('Shipping Address', 350, 140);

        
        const addressDetails = {
            name: address.name || 'N/A',
            landMark: address.landMark || 'N/A',
            city: address.city || 'N/A',
            state: address.state || 'N/A',
            pincode: address.pincode || 'N/A'
        };

        doc.font('Helvetica')
            .fontSize(10)
            .fillColor('#666666')
            .text(addressDetails.name, 350, 160)
            .text(addressDetails.landMark, 350, 175)
            .text(`${addressDetails.city}, ${addressDetails.state}`, 350, 190)
            .text(addressDetails.pincode, 350, 205);

        const tableTop = 250;
        doc.fillColor('#800000')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Product', 50, tableTop)
            .text('Quantity', 250, tableTop)
            .text('Unit Price', 350, tableTop)
            .text('Total', 450, tableTop);

        let currentHeight = tableTop + 30;
        for (const item of order.orderedItems) {
            if (!item.product) continue;
            
            const itemTotal = (item.quantity * item.price).toFixed(2);
            
            doc.font('Helvetica')
                .fillColor('#666666')
                .text(item.product.productName || 'Unknown Product', 50, currentHeight)
                .text(item.quantity.toString(), 250, currentHeight)
                .text(`RS ${item.price.toFixed(2)}`, 350, currentHeight)
                .text(`RS ${itemTotal}`, 450, currentHeight);

            currentHeight += 20;
        }

       
        currentHeight += 30;
        doc.strokeColor('#e0e0e0')
            .lineWidth(1)
            .moveTo(50, currentHeight)
            .lineTo(550, currentHeight)
            .stroke();

        doc.font('Helvetica-Bold')
            .fontSize(12)
            .fillColor('#800000')
            .text('Order Summary', 50, currentHeight + 20);

        doc.font('Helvetica')
            .fontSize(10)
            .fillColor('#666666')
            .text('Subtotal:', 350, currentHeight + 20)
            .text(`RS ${order.totalPrice.toFixed(2)}`, 450, currentHeight + 20);

        if (order.couponApplied) {
            doc.text('Coupon Applied:', 350, currentHeight + 40)
                .text('Yes', 450, currentHeight + 40);
        }

        if (order.discount > 0) {
            const discountHeight = order.couponApplied ? currentHeight + 60 : currentHeight + 40;
            doc.text('Discount:', 350, discountHeight)
                .text(`RS ${order.discount.toFixed(2)}`, 450, discountHeight);
        }

        const finalTotalHeight = (order.couponApplied || order.discount > 0) ? currentHeight + 80 : currentHeight + 40;
        doc.font('Helvetica-Bold')
            .fillColor('#800000')
            .text('Total:', 350, finalTotalHeight)
            .text(`RS ${order.finalAmount.toFixed(2)}`, 450, finalTotalHeight);

      
        doc.fontSize(8)
            .fillColor('#999999')
            .text('Thank you for shopping with Fiorea!', 50, 750, { align: 'center' })
            .text('This is a computer-generated invoice', 50, 765, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Invoice Generation Error:', {
            message: error.message,
            orderId,
            stack: error.stack
        });
        
        try {
            doc.end();
        } catch (e) {
            console.error('Error cleaning up PDF document:', e);
        }

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Error generating invoice',
                details: error.message
            });
        }
    }
};

const generateItemInvoice = async (req, res) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    try {
        const { orderId, itemId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            throw new Error('Invalid Order ID or Item ID');
        }

        const order = await Order.findById(orderId).populate({
            path: 'orderedItems.product',
            select: 'productName price'
        });

        if (!order) {
            throw new Error('Order not found');
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            throw new Error('Item not found in this order');
        }

        if (item.status !== 'Delivered') {
            return res.status(403).json({
                error: 'Invoice unavailable',
                message: 'Invoice can only be generated for delivered items'
            });
        }

        const addressDoc = await Address.findOne({ userId: req.session.user });
        const address = addressDoc?.address.find(addr => addr._id.toString() === order.address.toString());

        if (!address) {
            throw new Error('Shipping address not found');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Item_Invoice_${itemId}.pdf`);

        doc.pipe(res);

        doc.fillColor('#f4f4f4').rect(50, 50, 500, 50).fill();
        doc.fillColor('#800000').fontSize(25).font('Helvetica-Bold').text('Fiorea', 50, 65, { align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#666666').text('Wear the Art of Flowers', 50, 95, { align: 'center' });

        doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text('ITEM INVOICE', 50, 140);
        doc.font('Helvetica').fontSize(10).fillColor('#666666')
            .text(`Invoice Number: ITEM-${itemId.slice(-8).toUpperCase()}`, 50, 160)
            .text(`Date: ${moment(order.createdAt).format('DD/MM/YYYY')}`, 50, 175)
            .text(`Payment Method: ${order.paymentMethod}`, 50, 190)
            .text(`Payment Status: ${order.paymentStatus}`, 50, 205);

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#333333').text('Shipping Address', 350, 140);
        doc.font('Helvetica').fontSize(10).fillColor('#666666')
            .text(address.name, 350, 160)
            .text(address.landMark, 350, 175)
            .text(`${address.city}, ${address.state}`, 350, 190)
            .text(address.pincode, 350, 205);

        const tableTop = 250;
        doc.fillColor('#800000').font('Helvetica-Bold').fontSize(10)
            .text('Product', 50, tableTop)
            .text('Quantity', 250, tableTop)
            .text('Unit Price', 350, tableTop)
            .text('Total', 450, tableTop);

        const itemTotal = (item.quantity * item.price).toFixed(2);

        doc.font('Helvetica').fillColor('#666666').fontSize(10)
            .text(item.product.productName || 'Unknown Product', 50, tableTop + 30)
            .text(item.quantity.toString(), 250, tableTop + 30)
            .text(`RS ${item.price.toFixed(2)}`, 350, tableTop + 30)
            .text(`RS ${itemTotal}`, 450, tableTop + 30);

      
        const summaryTop = tableTop + 80;
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(50, summaryTop).lineTo(550, summaryTop).stroke();

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#800000').text('Order Summary', 50, summaryTop + 20);

        doc.font('Helvetica').fontSize(10).fillColor('#666666')
            .text('Item Total:', 350, summaryTop + 20)
            .text(`RS ${itemTotal}`, 450, summaryTop + 20);

        doc.fontSize(8).fillColor('#999999')
            .text('Thank you for shopping with Fiorea!', 50, 750, { align: 'center' })
            .text('This is a computer-generated invoice for the selected item', 50, 765, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Item Invoice Generation Error:', error.message);

        try {
            doc.end();
        } catch (e) {
            console.error('PDF Document Cleanup Error:', e);
        }

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to generate item invoice',
                message: error.message
            });
        }
    }
};

module.exports = {
    generateInvoice,
    generateItemInvoice
};