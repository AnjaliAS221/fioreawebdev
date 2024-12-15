const Product = require("../../models/productSchema");

const loadStock = async (req, res) => {
    try {
        const limit = 8; 
        const page = Math.max(1, parseInt(req.query.page) || 1);

       
        const products = await Product.find()
            .populate('category', 'name')
            .limit(limit)
            .skip((page - 1) * limit);

       
        const totalProducts = await Product.countDocuments();

        
        res.render('stock', {
            products,
            totalPages: Math.ceil(totalProducts / limit),
            currentPage: page,
        });
    } catch (error) {
        console.error("loadStock error:", error);
        res.status(500).send("Server Error");
    }
};

const updateStock = async (req, res) => {
    try {
        const {productId,newStock} = req.body;
        await Product.findByIdAndUpdate(productId, {quantity:newStock}, {new:true
        });
        res.json({success:true})
    } catch (error) {
        console.error("Error updating stock", error);
        res.json({ success: false });
    }
}



const searchProducts = async (req, res) => {
    const query = req.query.query || '';
    try {
        const products = await Product.find({
            productName: { $regex: query, $options: 'i' } 
        });
        res.json({ success: true, products });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching products' });
    }
};


module.exports = {
    loadStock,
    updateStock,
    searchProducts
};