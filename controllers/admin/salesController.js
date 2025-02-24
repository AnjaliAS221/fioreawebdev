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
        let filter = { status: "Delivered" };  

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
        res.status(500).render("error", { error: error.message });
    }
};



const exportSalesToPDF = async (req, res) => {
    try {
        let filter = { status: "Delivered" };
        const { startDate, endDate, dateRange } = req.query;

        if (startDate && endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: new Date(startDate), $lte: endDateTime };
        } else if (dateRange) {
            const today = moment().tz('Asia/Kolkata');
            const dateRanges = {
                today: [today.startOf('day').toDate(), today.endOf('day').toDate()],
                week: [today.clone().startOf('week').toDate(), today.clone().endOf('week').toDate()],
                month: [today.clone().startOf('month').toDate(), today.clone().endOf('month').toDate()],
                year: [today.clone().startOf('year').toDate(), today.clone().endOf('year').toDate()],
            };
            if (dateRanges[dateRange]) {
                filter.createdAt = { $gte: dateRanges[dateRange][0], $lte: dateRanges[dateRange][1] };
            }
        }

        const summary = await Order.aggregate([
            { $match: filter },
            { $group: {
                _id: null,
                totalSales: { $sum: "$finalAmount" },
                totalDiscount: { $sum: "$discount" },
                totalOrders: { $sum: 1 },
                totalProductsSold: { $sum: { $sum: "$orderedItems.quantity" } },
                uniqueUsers: { $addToSet: "$user" }
            }}
        ]);

        const stats = summary[0] || { totalSales: 0, totalDiscount: 0, totalOrders: 0, totalProductsSold: 0, uniqueUsers: [] };
        stats.uniqueUsersCount = stats.uniqueUsers.length;
        stats.averageOrderValue = stats.totalOrders > 0 ? (stats.totalSales / stats.totalOrders).toFixed(2) : 0;

        const orders = await Order.find(filter)
            .populate('user')
            .populate('orderedItems.product')
            .sort({ createdAt: -1 });

            const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
            doc.pipe(res);

            doc.fontSize(22).font('Helvetica-Bold').text('FIOREA', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(18).text('Sales Report', { align: 'center' });
            doc.moveDown(0.5);

            if (dateRange || (startDate && endDate)) {
                doc.fontSize(12)
                   .font('Helvetica')
                   .fillColor('#444')
                   .text(`Report Period: ${dateRange || `${startDate} to ${endDate}`}`, { align: 'center' });
                doc.moveDown();
            }

            doc.font('Helvetica-Bold')
            .fontSize(14)
            .fillColor('#000')
            .text('Sales Summary', { align: 'left' });
         doc.moveDown(0.5);
 
         
         const summaryStartY = doc.y;
         doc.rect(40, summaryStartY, 515, 140)
            .fillAndStroke('#f6f6f6', '#cccccc');
         

         doc.font('Helvetica')
            .fontSize(12)
            .fillColor('#000');
 
         doc.text(`Total Revenue`, 60, summaryStartY + 20);
         doc.font('Helvetica-Bold')
            .text(`₹${stats.totalSales.toLocaleString()}`, 60, summaryStartY + 40);
         
         doc.font('Helvetica')
            .text(`Total Orders`, 60, summaryStartY + 70);
         doc.font('Helvetica-Bold')
            .text(stats.totalOrders, 60, summaryStartY + 90);

         doc.font('Helvetica')
            .text(`Average Order Value`, 300, summaryStartY + 20);
         doc.font('Helvetica-Bold')
            .text(`₹${stats.averageOrderValue}`, 300, summaryStartY + 40);
         
         doc.font('Helvetica')
            .text(`Total Products Sold`, 300, summaryStartY + 70);
         doc.font('Helvetica-Bold')
            .text(stats.totalProductsSold, 300, summaryStartY + 90);
 
         doc.font('Helvetica')
            .text(`Customers: ${stats.uniqueUsersCount}`, 60, summaryStartY + 120);
         doc.text(`Total Discount: ₹${stats.totalDiscount.toLocaleString()}`, 300, summaryStartY + 120);
 
         doc.moveDown(3);

         doc.font('Helvetica-Bold')
            .fontSize(14)
            .text('Order Details', { align: 'left' });
         doc.moveDown(0.5);
 
         const columns = ['No', 'Customer', 'Products (Qty)', 'Date', 'Price', 'Discount', 'Final'];
         const columnWidths = [30, 80, 200, 80, 70, 70, 70];
         const startX = 40;
         let y = doc.y;

         doc.rect(startX, y, 515, 25)
            .fillAndStroke('#e6e6e6', '#cccccc');
         doc.fillColor('#000')
            .font('Helvetica-Bold')
            .fontSize(10);
         
         let x = startX + 5;
         columns.forEach((col, i) => {
             doc.text(col, x, y + 7, { width: columnWidths[i], align: 'center' });
             x += columnWidths[i];
         });
         y += 25;
 
         doc.font('Helvetica').fontSize(9);
         orders.forEach((order, index) => {
            if (y > 700) { 
                doc.addPage(); 
                y = 50; 
                doc.font('Helvetica-Bold').fontSize(14).text('Order Details (Continued)', { align: 'left' });
                doc.moveDown(0.5);
            }
 
             
             if (index % 2 === 0) {
                 doc.rect(startX, y, 515, 20).fillAndStroke('#f9f9f9', '#cccccc');
             } else {
                 doc.rect(startX, y, 515, 20).stroke('#cccccc');
             }
 
             let x = startX + 5;
             const rowData = [
                index + 1,
                order.user ? order.user.name : 'N/A',
                order.orderedItems.map(item => `${item.product ? item.product.productName : 'N/A'} (${item.quantity})`).join(', '),
                moment(order.createdAt).format('DD/MM/YYYY'),
                `₹${Math.round(order.totalPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                `₹${Math.round(order.discount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                `₹${Math.round(order.finalAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
            ];
 
             doc.fillColor('#000');
             rowData.forEach((text, i) => {
                 doc.text(text, x, y + 5, { width: columnWidths[i],height: 15, align: 'center' });
                 x += columnWidths[i];
             });
             y += 20;
         });

         const pages = doc.bufferedPageRange();
         for (let i = 0; i < pages.count; i++) {
             doc.switchToPage(i);
             doc.fontSize(8)
                .fillColor('#666')
                .text(
                    `Page ${i + 1} of ${pages.count}`,
                    40,
                    doc.page.height - 30,
                    { align: 'center', width: 515 }
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
        let filter = { status: "Delivered" };

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
                    filter.createdAt = { $gte: today.startOf('day').toDate(), $lte: today.endOf('day').toDate() };
                    break;
                case 'week':
                    filter.createdAt = { $gte: today.startOf('week').toDate(), $lte: today.endOf('week').toDate() };
                    break;
                case 'month':
                    filter.createdAt = { $gte: today.startOf('month').toDate(), $lte: today.endOf('month').toDate() };
                    break;
                case 'year':
                    filter.createdAt = { $gte: today.startOf('year').toDate(), $lte: today.endOf('year').toDate() };
                    break;
            }
        }

        const summary = await Order.aggregate([
            { $match: filter },
            { $group: {
                _id: null,
                totalSales: { $sum: "$finalAmount" },
                totalDiscount: { $sum: "$discount" },
                totalOrders: { $sum: 1 },
                totalProductsSold: { $sum: { $sum: "$orderedItems.quantity" } },
                uniqueUsers: { $addToSet: "$user" }
            }}
        ]);

        const stats = summary[0] || { totalSales: 0, totalDiscount: 0, totalOrders: 0, totalProductsSold: 0, uniqueUsers: [] };
        stats.uniqueUsersCount = stats.uniqueUsers.length;
        stats.averageOrderValue = stats.totalOrders > 0 ? (stats.totalSales / stats.totalOrders).toFixed(2) : 0;

        const orders = await Order.find(filter)
            .populate('user')
            .populate('orderedItems.product')
            .sort({ createdAt: -1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.mergeCells('A1:B1'); 
        worksheet.getCell('A1').value = "Sales Summary";
        worksheet.getCell('A1').font = { bold: true, size: 14 };

        worksheet.addRow(["Total Revenue", `₹${Math.round(stats.totalSales).toLocaleString()}`]);
        worksheet.addRow(["Total Discount", `₹${Math.round(stats.totalDiscount).toLocaleString()}`]);
        worksheet.addRow(["Total Orders", stats.totalOrders]);
        worksheet.addRow(["Total Products Sold", stats.totalProductsSold]);
        worksheet.addRow(["Customers", stats.uniqueUsersCount]);
        worksheet.addRow(["Average Order Value", `₹${stats.averageOrderValue}`]);

        worksheet.addRow([]);

        const headerRow = worksheet.addRow(["No.", "User Name", "Product(s)", "Date", "Total Price", "Discount", "Final Amount"]);
        headerRow.font = { bold: true };
        

        worksheet.columns = [
            { key: 'no', width: 5 },
            { key: 'username', width: 20 },
            { key: 'products', width: 30 },
            { key: 'date', width: 15 },
            { key: 'totalPrice', width: 15 },
            { key: 'discount', width: 15 },
            { key: 'finalAmount', width: 15 }
        ];

        orders.forEach((order, index) => {
            worksheet.addRow({
                no: index + 1,
                username: order.user ? order.user.name : 'N/A',
                products: order.orderedItems.map(item => `${item.product ? item.product.productName : 'N/A'} (${item.quantity})`).join(', '),
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