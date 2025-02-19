const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');


const loadShoppingPage = async (req, res) => {
    try {
        const allCategories = await Category.find();

        let userData = null;
        let wishlistProducts = [];

        if (req.session.user) {
            userData = await User.findOne({ _id: req.session.user });
            wishlistProducts = userData.wishlist.map(item => item.toString());
        }

        const listedCategories = await Category.find({ isListed: true });
        const categoryIds = listedCategories.map((category) => category._id.toString());

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
        }).populate('variants').sort({ createdAt: -1 }).skip(skip).limit(limit);

        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
        });

        const totalPages = Math.ceil(totalProducts / limit);

        const categoriesWithIds = listedCategories.map(category => ({ _id: category._id, name: category.name }));

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

        res.render("shop", {
            user: userData,
            products: productsWithStockStatus,
            wishlistProducts,
            categories: allCategories,
            category: categoriesWithIds,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
        });
    } catch (error) {
        console.log("shopping page not loading:", error);
        res.redirect("/pageNotFound");
    }
};

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        

        const productId = req.query.id;
        const product = await Product.findOne({
            _id: productId,
            isBlocked: false
        }).populate('category');

        const findCategory = product.category;
        const categoryOffer = findCategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        
        let isInWishlist = false;
        if (userId && userData) {
            isInWishlist = userData.wishlist?.includes(productId) || false;
        }

        const colors = [...new Set(product.variants.map(variant => variant.color))];
        

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

        let totalStock = 0;
        product.variants.forEach((variant) => {
            variant.sizes.forEach((size) => {
                totalStock += size.stock;
            });
        });

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
            isInWishlist,
            totalStock  
        });
    } catch (error) {
        console.error("Error fetching product details", error);
        res.redirect("/pageNotFound");
    }
}
const searchProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        let search = req.body.query.trim();

        const categories = await Category.find({ isListed: true }).lean();
        const categoryIds = categories.map(category => category._id.toString());

        let searchResult = [];
        if (req.session.filteredProducts && req.session.filteredProducts.length > 0) {
            searchResult = req.session.filteredProducts.filter(product => {
                return product.productName.toLowerCase().includes(search.toLowerCase());
            });
        } else {
            searchResult = await Product.find({
                productName: { $regex: ".*" + search + ".*", $options: "i" },
                isBlocked: false,
                category: { $in: categoryIds }
            });
        }

     
        const searchResultsWithStock = searchResult.map(product => {
            let totalStock = 0;
            product.variants.forEach(variant => {
                variant.sizes.forEach(size => {
                    totalStock += size.stock;
                });
            });

            return {
                ...product.toObject(),
                totalStock
            };
        });

        searchResultsWithStock.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(searchResultsWithStock.length / itemsPerPage);
        const currentProduct = searchResultsWithStock.slice(startIndex, endIndex);

        res.render("shop", {
            user: userData,
            products: currentProduct,
            categories: categories,
            totalPages,
            currentPage,
            count: searchResultsWithStock.length,
        });
    } catch (error) {
        console.log(error);
        res.redirect("/pageNotFound");
    }
};


module.exports = {
    loadShoppingPage,
    searchProducts,
    productDetails,
}