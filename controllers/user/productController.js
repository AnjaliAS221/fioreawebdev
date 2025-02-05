const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');


const handleError = (res, error, customMessage = 'An error occurred') => {
    console.error(customMessage, error);
    res.status(500).render('page-404', { message: customMessage });
};

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('the userId', userId);
        const userData = await User.findById(userId);
        console.log('The userData', userData);

        const productId = req.query.id;
        console.log("Product ID:", req.query.id); 
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;

        const categoryOffer = findCategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        
        let isInWishlist = false;
        if (userId && userData) {
            isInWishlist = userData.wishlist?.includes(productId) || false;
        }

        const colors = [...new Set(product.variants.map(variant => variant.color))];
        console.log("Product Variants:", product.variants);

        const colorSizeMap = {};
        colors.forEach(color => {
            const variantsForColor = product.variants.find(v => v.color === color);
            if (variantsForColor) {
                colorSizeMap[color] = variantsForColor.sizes.map(s => ({
                    size: s.size,
                    stock: s.stock
                }));
            }
        });

        const totalQuantity = product.variants.reduce((total, variant) => {
            return total + variant.sizes.reduce((sizeTotal, size) => {
                return sizeTotal + size.stock;
            }, 0);
        }, 0);

        res.render("product-details", {
            user: userData,
            product: {
                ...product.toObject(),
                colors,
                colorSizeMap, 
                variants: product.variants
            },
            totalOffer,
            category: findCategory,
            quantity: totalQuantity,
            isInWishlist  
        });
    } catch (error) {
        console.error("Error fetching product details", error);
        res.redirect("/pageNotFound");
    }
}

const getAllProducts = async (req, res) => {
    try {
        const limit = 16;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const userId = req.session.user;

        const [products, count, categories, user] = await Promise.all([
            Product.find({ isBlocked: false }).lean(),
            Product.countDocuments(),
            Category.find({ isListed: false }),
            User.findById(userId)
        ]);

        const wishlistedProducts = user ? user.wishlist.map(id => id.toString()) : [];

        const productsWithWishlistStatus = products.map(product => ({
            ...product,
            isInWishlist: wishlistedProducts.includes(product._id.toString())
        }));

        const paginatedProducts = productsWithWishlistStatus
            .slice((page - 1) * limit, page * limit);

        const totalPages = Math.ceil(count / limit);

        res.render('all-products', {
            products: paginatedProducts,
            categories,
            totalPages,
            currentPage: page
        });
    } catch (error) {
        handleError(res, error, 'Error loading all products');
    }
};





module.exports = {
    productDetails,
    getAllProducts,
   
}