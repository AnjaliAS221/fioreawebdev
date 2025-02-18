const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");

const sortSearch = async (req, res) => {
    try {
        const { search = '', category = 'all-categories', sort = 'default' } = req.body;

        const query = { isBlocked: false }; 

        if (search.trim()) {
            query.$or = [
                { productName: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        if (category !== 'all-categories') {
            query.category = category;
        }

        let sortCondition = {};
        let collation = null;

        switch (sort) {
            case 'popularity':
                sortCondition = { popularity: -1 };
                break;
            case 'price-low-high':
                sortCondition = { salePrice: 1 };
                break;
            case 'price-high-low':
                sortCondition = { salePrice: -1 };
                break;
            case 'rating':
                sortCondition = { rating: -1 };
                break;
            case 'new-arrivals':
                sortCondition = { createdAt: -1 };
                break;
            case 'alphabetical-a-z':
                sortCondition = { productName: 1 };
                collation = { locale: 'en', strength: 2 };
                break;
            case 'alphabetical-z-a':
                sortCondition = { productName: -1 };
                collation = { locale: 'en', strength: 2 };
                break;
            default:
                sortCondition = { createdAt: -1 };
        }

        let productsQuery = Product.find(query)
            .populate('variants')
            .sort(sortCondition);

        if (collation) {
            productsQuery = productsQuery.collation(collation);
        }

        const products = await productsQuery;

        const productsWithStockStatus = products.map(product => {
            let totalStock = 0;
            if (product.variants && Array.isArray(product.variants)) {
                product.variants.forEach(variant => {
                    if (variant.sizes && Array.isArray(variant.sizes)) {
                        variant.sizes.forEach(size => {
                            totalStock += size.stock || 0;
                        });
                    }
                });
            }
            return {
                ...product.toObject(),
                totalStock
            };
        });

        res.json({
            success: true,
            products: productsWithStockStatus,
            filters: { search, category, sort }
        });

    } catch (error) {
        console.error("Error in sort and search:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

module.exports = {
    sortSearch,
};
