const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema');



const loadWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const wishlistDoc = await Wishlist.findOne({ userId })
            .populate({
                path: 'products.productId',
                model: 'Product',
                populate: { path: 'category' }
            });

        const wishlistProducts = wishlistDoc ? 
            wishlistDoc.products.map(item => item.productId).slice(skip, skip + limit) : 
            [];

        const totalWishlistProducts = wishlistDoc ? wishlistDoc.products.length : 0;

        res.render("wishlist", {
            wishlist: wishlistProducts,
            currentPage: page,
            totalPages: Math.ceil(totalWishlistProducts / limit),
            hasNextPage: page < Math.ceil(totalWishlistProducts / limit),
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1
        });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.redirect('/pageNotFound');
    }
};


const getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .select('productName salePrice productImage variants status')
            .lean();
            
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }

        // Extract unique colors from variants
        const colors = product.variants.map(variant => variant.color);
        
        // Create colorSizeMap based on variants structure
        const colorSizeMap = {};
        product.variants.forEach(variant => {
            colorSizeMap[variant.color] = variant.sizes.map(size => ({
                size: size.size,
                stock: size.stock
            }));
        });
        
        // Check if product has any stock and is available
        const hasStock = product.variants.some(variant => 
            variant.sizes.some(size => size.stock > 0)
        );
        const isAvailable = hasStock && product.status === "Available";
        
        res.json({
            success: true,
            product: {
                ...product,
                colors,
                colorSizeMap,
                isAvailable
            }
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};

const toggleWishlist = async (req, res) => {
    try {
        const productId = req.body.productId;
        const userId = req.session.user;
        
        let wishlistDoc = await Wishlist.findOne({ userId });
        
        if (!wishlistDoc) {
            wishlistDoc = new Wishlist({ userId, products: [] });
        }

        const productIndex = wishlistDoc.products.findIndex(
            p => p.productId.toString() === productId
        );

        let action, message;
        if (productIndex !== -1) {
            wishlistDoc.products.splice(productIndex, 1);
            action = 'removed';
            message = 'Product removed from Wishlist';
        } else {
            wishlistDoc.products.push({ 
                productId: productId, 
                addedOn: new Date() 
            });
            action = 'added';
            message = 'Product added to Wishlist';
        }

        await wishlistDoc.save();
        
        const user = await User.findById(userId);
        user.wishlist = wishlistDoc.products.map(p => p.productId);
        await user.save();

        return res.status(200).json({
            status: true,
            action: action,
            message: message
        });
    } catch (error) {
        console.error('Wishlist Toggle Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Server error',
            errorDetails: error.message
        });
    }
};

const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId, size, color } = req.body;

        // Validate product exists and has stock
        const product = await Product.findById(productId);
        if (!product) {
            return res.json({
                success: false,
                message: 'Product not found'
            });
        }

        // Find the selected size and check stock
        const selectedSize = product.sizes.find(s => s.size === size);
        if (!selectedSize) {
            return res.json({
                success: false,
                message: 'Selected size not found'
            });
        }

        if (selectedSize.stock === 0) {
            return res.json({
                success: false,
                message: 'Selected size is out of stock'
            });
        }

        // Validate color
        if (!product.colors.includes(color)) {
            return res.json({
                success: false,
                message: 'Invalid color selected'
            });
        }

        // Check if product already exists in cart with same size and color
        const existingCart = await Cart.findOne({ userId });
        
        if (existingCart) {
            const existingItem = existingCart.items.find(item => 
                item.productId.toString() === productId &&
                item.size === size &&
                item.color === color
            );

            if (existingItem) {
                // Update quantity if stock allows
                if (existingItem.quantity < selectedSize.stock) {
                    existingItem.quantity += 1;
                    await existingCart.save();
                } else {
                    return res.json({
                        success: false,
                        message: 'Maximum available stock reached'
                    });
                }
            } else {
                // Add new item to cart
                existingCart.items.push({
                    productId,
                    size,
                    color,
                    quantity: 1
                });
                await existingCart.save();
            }
        } else {
            // Create new cart
            await Cart.create({
                userId,
                items: [{
                    productId,
                    size,
                    color,
                    quantity: 1
                }]
            });
        }

        res.json({
            success: true,
            message: 'Product added to cart successfully'
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.json({
            success: false,
            message: 'Failed to add product to cart'
        });
    }
};

const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const wishlistDoc = await Wishlist.findOne({ userId });
        
        const wishlist = wishlistDoc ? 
            wishlistDoc.products.map(p => p.productId.toString()) : 
            [];

        res.json({ wishlist });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const removeProduct = async (req, res) => {
    try {
        const productId = req.query.productId;
        const userId = req.session.user;
        
        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: productId }
        });
        
        await Wishlist.findOneAndUpdate(
            { userId: userId },
            { $pull: { products: { productId: productId } } }
        );
        
        return res.redirect("/wishlist");
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
};

module.exports = {
    loadWishlist,
    getProductDetails,
    addToCart,
    toggleWishlist,
    getWishlist,
    removeProduct,
}