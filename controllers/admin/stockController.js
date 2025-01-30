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
        
        // Calculate total stock for each product
        const productsWithTotalStock = products.map(product => {
            const totalStock = product.variants.reduce((variantTotal, variant) => {
                return variantTotal + variant.sizes.reduce((sizeTotal, size) => {
                    return sizeTotal + size.stock;
                }, 0);
            }, 0);
            
            return {
                ...product._doc,
                totalStock
            };
        });
        
        res.render('stock', {
            products: productsWithTotalStock,
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
        const { productId, variantId, sizeId, newStock } = req.body;
        
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found" 
            });
        }

        // Find the variant and size
        const variant = product.variants.id(variantId);
        if (!variant) {
            return res.status(404).json({
                success: false,
                message: "Variant not found"
            });
        }

        const size = variant.sizes.id(sizeId);
        if (!size) {
            return res.status(404).json({
                success: false,
                message: "Size not found"
            });
        }

        // Update the stock
        size.stock = parseInt(newStock);
        await product.save();

        // Calculate new total stock
        const totalStock = product.variants.reduce((variantTotal, variant) => {
            return variantTotal + variant.sizes.reduce((sizeTotal, size) => {
                return sizeTotal + size.stock;
            }, 0);
        }, 0);
        
        res.json({ 
            success: true, 
            updatedProduct: product,
            totalStock
        });
        
    } catch (error) {
        console.error('Stock update error:', error);
        res.status(500).json({ 
            success: false, 
            message: "An error occurred while updating stock." 
        });
    }
};


const searchProducts = async (req, res) => {
    const query = req.query.query || '';
    const category = req.query.category || '';
    
    try {
        let searchQuery = {};
        
        if (query) {
            searchQuery.productName = { $regex: query, $options: 'i' };
        }
        
        if (category && category !== 'All') {
            const populatedProducts = await Product.find(searchQuery)
                .populate({
                    path: 'category',
                    match: { name: category }
                });
                
            const filteredProducts = populatedProducts.filter(product => product.category);
            
            // Add total stock calculation
            const productsWithStock = filteredProducts.map(product => ({
                ...product._doc,
                totalStock: product.variants.reduce((variantTotal, variant) => {
                    return variantTotal + variant.sizes.reduce((sizeTotal, size) => {
                        return sizeTotal + size.stock;
                    }, 0);
                }, 0)
            }));
            
            return res.json({ success: true, products: productsWithStock });
        }
        
        const products = await Product.find(searchQuery).populate('category');
        
        // Add total stock calculation
        const productsWithStock = products.map(product => ({
            ...product._doc,
            totalStock: product.variants.reduce((variantTotal, variant) => {
                return variantTotal + variant.sizes.reduce((sizeTotal, size) => {
                    return sizeTotal + size.stock;
                }, 0);
            }, 0)
        }));
        
        res.json({ success: true, products: productsWithStock });
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, message: 'Error fetching products' });
    }
};

module.exports = {
    loadStock,
    updateStock,
    searchProducts,
};