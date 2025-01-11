const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");



const sortSearch = async (req, res) => {
    try {
        const { search = '', category = 'all-categories', sort = 'default' } = req.body;

        // Build the query
        const query = {};

        // Add search condition if search term exists
        if (search.trim()) {
            query.$or = [
                { productName: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        // Add category filter if specific category selected
        if (category !== 'all-categories') {
            query.category = category;
        }

        // Define sorting conditions with collation for proper alphabetical sorting
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
                collation = { locale: 'en', strength: 2 }; // Case-insensitive sorting
                break;
            case 'alphabetical-z-a':
                sortCondition = { productName: -1 };
                collation = { locale: 'en', strength: 2 }; // Case-insensitive sorting
                break;
            default:
                sortCondition = { createdAt: -1 };
        }

        // Fetch products with combined query
        let productsQuery = Product.find(query)
            .sort(sortCondition)
            .lean();

        // Apply collation for alphabetical sorting if needed
        if (collation) {
            productsQuery = productsQuery.collation(collation);
        }

        const products = await productsQuery;

        // Log the sorted products for debugging (remove in production)
        if (sort === 'alphabetical-a-z' || sort === 'alphabetical-z-a') {
            console.log('Sorted products:', products.map(p => p.productName));
        }

        res.json({
            success: true,
            products: products,
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