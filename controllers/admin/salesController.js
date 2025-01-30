const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const moment = require('moment-timezone');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const loadSalesReport = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { startDate, endDate, dateRange } = req.query;
        let filter = {};


      
        if (startDate && endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: endDateTime
            };
            
        } else if (dateRange) {
            
            const today = moment().tz('Asia/Kolkata');
            
            switch (dateRange) {
                case 'today':
                    filter.createdAt = {
                        $gte: today.startOf('day').toDate(),
                        $lte: today.endOf('day').toDate()
                    };
                    break;
                case 'week':
                    filter.createdAt = {
                        $gte: today.clone().startOf('week').toDate(),
                        $lte: today.clone().endOf('week').toDate()
                    };
                    break;
                case 'month':
                    filter.createdAt = {
                        $gte: today.clone().startOf('month').toDate(),
                        $lte: today.clone().endOf('month').toDate()
                    };
                    break;
                case 'year':
                    filter.createdAt = {
                        $gte: today.clone().startOf('year').toDate(),
                        $lte: today.clone().endOf('year').toDate()
                    };
                    break;
            }
           
        }
        
    
        const serialNumberOffset = (page - 1) * limit;

     

        const orderData = await Order.find(filter)
            .populate({
                path: 'user',
                select: 'name email'
            })
            .populate({
                path: 'orderedItems.product',
                select: 'productName price'
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

           

        const totalOrders = await Order.countDocuments(filter);

        const totalPages = Math.ceil(totalOrders / limit);
           

        const aggregateResults = await Order.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$finalAmount" },
                    totalDiscount: { $sum: "$discount" }
                }
            }
        ]);

        const stats = aggregateResults[0] || { totalSales: 0, totalDiscount: 0 };
        const uniqueUsers = await Order.distinct('user', filter);

        

        res.render("salesReports", {
            orders: orderData,
            count: totalOrders,
            totalPages,
            currentPage: page,
            serialNumberOffset,  
            totalDiscount: Math.round(stats.totalDiscount),
            totalUsers: uniqueUsers.length,
            totalSales: Math.round(stats.totalSales),
            startDate: startDate || '',
            endDate: endDate || '',
            dateRange: dateRange || '',
            moment: moment
        });

    } catch (error) {
        console.error("Error loading sales report:", error);
        console.error("Error stack:", error.stack);
        res.status(500).render("error", { error: error.message });
    }
};

const exportSalesToPDF = async (req, res) => {
    try {
        let filter = {};
        const { startDate, endDate, dateRange } = req.query;

      if (startDate && endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: endDateTime
            };
        } else if (dateRange) {
            const today = moment().tz('Asia/Kolkata');
            
            switch (dateRange) {
                case 'today':
                    filter.createdAt = {
                        $gte: today.startOf('day').toDate(),
                        $lte: today.endOf('day').toDate()
                    };
                    break;
                case 'week':
                    filter.createdAt = {
                        $gte: today.clone().startOf('week').toDate(),
                        $lte: today.clone().endOf('week').toDate()
                    };
                    break;
                case 'month':
                    filter.createdAt = {
                        $gte: today.clone().startOf('month').toDate(),
                        $lte: today.clone().endOf('month').toDate()
                    };
                    break;
                case 'year':
                    filter.createdAt = {
                        $gte: today.clone().startOf('year').toDate(),
                        $lte: today.clone().endOf('year').toDate()
                    };
                    break;
            }
        }

        const orders = await Order.find(filter)
            .populate('user')
            .populate('orderedItems.product')
            .sort({ createdAt: -1 });

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4', 
            layout: 'landscape',
            bufferPages: true
        });

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="sales-report.pdf"'
        });

        doc.pipe(res);

      
        doc.font('Helvetica-Bold').fontSize(16)
           .text('Sales Report', { align: 'center' });
        doc.moveDown();

        
        if (dateRange || (startDate && endDate)) {
            doc.fontSize(12)
               .text(`Period: ${dateRange || `${startDate} to ${endDate}`}`, { align: 'center' });
            doc.moveDown();
        }

        const columns = [
            { header: 'No', width: 30 },
            { header: 'User', width: 80 },
            { header: 'Products (Qty)', width: 220 },
            { header: 'Date', width: 80 },
            { header: 'Price', width: 70 },
            { header: 'Discount', width: 70 },
            { header: 'Final', width: 70 }
        ];

        const tableTop = doc.y + 20;
        const columnSpacing = 15;

        const drawTableHeader = (y) => {
            doc.font('Helvetica-Bold').fontSize(10);
            let x = 50;
            
            columns.forEach(column => {
                doc.text(column.header, x, y);
                x += column.width + columnSpacing;
            });
        };

        drawTableHeader(tableTop);
       
        let y = tableTop + 20;
        doc.font('Helvetica').fontSize(9);

        orders.forEach((order, index) => {
            if (y > doc.page.height - 100) {
                doc.addPage();
                y = 50;
                drawTableHeader(y);
                y += 20;
            }

            let x = 50;

           
            doc.text(String(index + 1), x, y);
            x += columns[0].width + columnSpacing;

         
            doc.text(order.user ? order.user.username : 'N/A', x, y);
            x += columns[1].width + columnSpacing;

            const productsWithQty = order.orderedItems
                .map(item => `${item.product ? item.product.productName : 'N/A'} (${item.quantity})`)
                .join(', ');
            doc.text(productsWithQty, x, y, {
                width: columns[2].width,
                height: 40
            });
            x += columns[2].width + columnSpacing;

            doc.text(moment(order.createdAt).format('DD/MM/YYYY'), x, y);
            x += columns[3].width + columnSpacing;

            doc.text(`₹${Math.round(order.totalPrice).toLocaleString()}`, x, y);
            x += columns[4].width + columnSpacing;

            doc.text(`₹${Math.round(order.discount).toLocaleString()}`, x, y);
            x += columns[5].width + columnSpacing;

            doc.text(`₹${Math.round(order.finalAmount).toLocaleString()}`, x, y);

            const lineHeight = 20;
            y += lineHeight;
        });

       
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8);
            doc.text(
                `Page ${i + 1} of ${pages.count}`,
                50,
                doc.page.height - 50,
                { align: 'center' }
            );
        }

        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Failed to generate PDF');
    }
};

const exportSalesToExcel = async (req, res) => {
    try {
        let filter = {};
        const { startDate, endDate, dateRange } = req.query;

        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        } else if (dateRange) {
            const today = moment();
            switch (dateRange) {
                case 'today':
                    filter.createdAt = {
                        $gte: today.startOf('day').toDate(),
                        $lte: today.endOf('day').toDate()
                    };
                    break;
                case 'week':
                    filter.createdAt = {
                        $gte: today.startOf('week').toDate(),
                        $lte: today.endOf('week').toDate()
                    };
                    break;
                case 'month':
                    filter.createdAt = {
                        $gte: today.startOf('month').toDate(),
                        $lte: today.endOf('month').toDate()
                    };
                    break;
                case 'year':
                    filter.createdAt = {
                        $gte: today.startOf('year').toDate(),
                        $lte: today.endOf('year').toDate()
                    };
                    break;
            }
        }

        const orders = await Order.find(filter)
            .populate('user')
            .populate('orderedItems.product')
            .sort({ createdAt: -1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { header: 'No.', key: 'no', width: 5 },
            { header: 'User Name', key: 'username', width: 20 },
            { header: 'Product(s)', key: 'products', width: 30 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Total Price', key: 'totalPrice', width: 15 },
            { header: 'Discount', key: 'discount', width: 15 },
            { header: 'Final Amount', key: 'finalAmount', width: 15 }
        ];

        orders.forEach((order, index) => {
            worksheet.addRow({
                no: index + 1,
                username: order.user ? order.user.username : 'N/A',
                products: order.orderedItems
                    .map(item => `${item.product ? item.product.productName : 'N/A'} (${item.quantity})`)
                    .join(', '),
                date: moment(order.createdAt).format('DD/MM/YYYY'),
                totalPrice: `₹${Math.round(order.totalPrice).toLocaleString()}`,
                discount: `₹${Math.round(order.discount).toLocaleString()}`,
                finalAmount: `₹${Math.round(order.finalAmount).toLocaleString()}`
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating Excel:', error);
        res.status(500).send('Failed to generate Excel');
    }
};


module.exports = {
    loadSalesReport,
    exportSalesToPDF,
    exportSalesToExcel
};