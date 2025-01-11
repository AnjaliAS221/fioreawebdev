const Order = require('../../models/orderSchema'); 

const loadDashboard = async (req, res) => {
    try {
        if (req.session.admin) {
            const salesData = await getTotalSales();
            const products = await getMostSellingProducts();
            const categories = await getMostSellingCategories();
            const count = await Order.countDocuments();

            res.render('dashboard', { 
                salesData: salesData || { totalSalesAmount: 0, weekly: {}, monthly: {}, yearly: {} }, 
                products: products || [], 
                categories: categories || [], 
                count: count || 0
            });
        } else {
            res.redirect('/admin/login');
        }
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.redirect('/pageerror');
    }
};

async function getTotalSales() {
    try {
        const totalSales = await Order.aggregate([
            { $group: { _id: null, totalSalesAmount: { $sum: "$finalAmount" } } }
        ]);

        const weeklySales = await Order.aggregate([
            { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
            { $group: { _id: { $isoWeek: "$createdAt" }, sales: { $sum: "$finalAmount" } } }
        ]);

        const monthlySales = await Order.aggregate([
            { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
            { $group: { _id: { $month: "$createdAt" }, sales: { $sum: "$finalAmount" } } }
        ]);

        const yearlySales = await Order.aggregate([
            { $group: { _id: { $year: "$createdAt" }, sales: { $sum: "$finalAmount" } } },
            { $sort: { "_id": 1 } },
            { $limit: 5 }
        ]);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const weeklyData = {
            labels: Array.from({ length: 52 }, (_, i) => `Week ${i + 1}`),
            data: Array(52).fill(0)
        };
        weeklySales.forEach(item => {
            const weekIndex = item._id - 1; 
            if (weekIndex >= 0 && weekIndex < 52) {
                weeklyData.data[weekIndex] = item.sales;
            }
        });

        const monthlyData = {
            labels: monthNames,
            data: Array(12).fill(0)
        };
        monthlySales.forEach(item => {
            const monthIndex = item._id - 1; 
            monthlyData.data[monthIndex] = item.sales;
        });

        const currentYear = new Date().getFullYear();
        const yearlyData = {
            labels: Array.from({ length: 5 }, (_, i) => (currentYear - 4 + i).toString()),
            data: Array(5).fill(0)
        };
        yearlySales.forEach(item => {
            const yearIndex = yearlyData.labels.indexOf(item._id.toString());
            if (yearIndex !== -1) {
                yearlyData.data[yearIndex] = item.sales;
            }
        });

        return {
            totalSalesAmount: totalSales.length > 0 ? totalSales[0].totalSalesAmount : 0,
            weekly: weeklyData,
            monthly: monthlyData,
            yearly: yearlyData
        };
    } catch (error) {
        console.error("Error calculating sales data:", error);
        return {
            totalSalesAmount: 0,
            weekly: { labels: [], data: [] },
            monthly: { labels: [], data: [] },
            yearly: { labels: [], data: [] }
        };
    }
}

async function getMostSellingProducts() {
    try {
        const result = await Order.aggregate([
            { $unwind: "$orderedItems" },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails.productName",
                    totalQuantitySold: { $sum: "$orderedItems.quantity" }
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 10 }
        ]);

        return result;
    } catch (error) {
        console.error("Error finding most selling products:", error);
        return [];
    }
}

async function getMostSellingCategories() {
    try {
        const result = await Order.aggregate([
            { $unwind: "$orderedItems" },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $lookup: {
                    from: "categories",
                    localField: "productDetails.category",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: "$categoryDetails" },
            {
                $group: {
                    _id: "$productDetails.category",
                    categoryName: { $first: "$categoryDetails.name" },
                    totalQuantitySold: { $sum: "$orderedItems.quantity" }
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 10 }
        ]);

        return result;
    } catch (error) {
        console.error("Error finding most selling categories:", error);
        return [];
    }
}



const generateLedgerBook = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Fetch Sales Data
        const salesData = await Order.aggregate([
            {
                $group: {
                    _id: { 
                        month: { $month: "$createdOn" }, 
                        year: { $year: "$createdOn" }
                    },
                    totalSales: { $sum: "$finalAmount" },
                    totalOrders: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    month: "$_id.month",
                    year: "$_id.year",
                    totalSales: 1,
                    totalOrders: 1
                }
            },
            { $sort: { year: 1, month: 1 } }
        ]);

        // Fetch Product Sales
        const productData = await Order.aggregate([
            { $unwind: "$orderedItems" },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.productId",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails._id",
                    productName: { $first: "$productDetails.productName" },
                    totalQuantitySold: { $sum: "$orderedItems.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } }
                }
            },
            { $sort: { totalQuantitySold: -1 } }
        ]);

        // Fetch Category Sales
        const categoryData = await Order.aggregate([
            { $unwind: "$orderedItems" },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.productId",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $lookup: {
                    from: "categories",
                    localField: "productDetails.category",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: "$categoryDetails" },
            {
                $group: {
                    _id: "$categoryDetails._id",
                    categoryName: { $first: "$categoryDetails.name" },
                    totalQuantitySold: { $sum: "$orderedItems.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } }
                }
            },
            { $sort: { totalQuantitySold: -1 } }
        ]);

        res.json({
            sales: salesData,
            products: productData,
            categories: categoryData
        });
    } catch (error) {
        console.error("Ledger Generation Error:", error);
        res.status(500).json({ error: 'Failed to generate ledger book' });
    }
};

module.exports = { 
    loadDashboard,
    generateLedgerBook,
 };
