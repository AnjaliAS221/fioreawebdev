const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');


const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId);
        const cartItems = await Cart.findOne({ userId }).populate('items.productId');

        if (!cartItems || cartItems.items.length === 0) {
            return res.render('cart', { 
                cart: null, 
                products: [], 
                totalAmount: 0, 
                user 
            });
        }

        const validItems = cartItems.items.filter(item => {
            if (!item.productId || item.productId.isBlocked) return false;

            const variant = item.productId.variants.find(v => v.color === item.color);
            if (!variant) return false;

            const sizeInfo = variant.sizes.find(s => s.size === item.size);

            item.inStock = Boolean(sizeInfo && sizeInfo.stock >= item.quantity);
            return true;
        });

        if (validItems.length !== cartItems.items.length) {
            cartItems.items = validItems;
            await cartItems.save();
        }

        const totalAmount = validItems.reduce((sum, item) => 
            item.inStock ? sum + item.totalPrice : sum, 0
        );

        const hasOutOfStockItems = validItems.some(item => !item.inStock);
        const inStockItems = validItems.filter(item => item.inStock);

        res.render('cart', { 
            cart: cartItems, 
            products: validItems, 
            totalAmount,
            user,
            hasOutOfStockItems,
            inStockItemsCount: inStockItems.length
        });
    } catch (error) {
        console.error("Error loading cart", error);
        res.redirect('/page-not-found');
    }
};

const addCart = async (req, res) => {
    try {
        const { productId, size, color } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const variant = product.variants.find(v => v.color === color);
        if (!variant) {
            return res.status(400).json({ success: false, message: "Variant color not found" });
        }

        const sizeVariant = variant.sizes.find(s => s.size === size);
        if (!sizeVariant) {
            return res.status(400).json({ success: false, message: "Size not found for selected variant" });
        }

        const variantId = variant._id;
        const sizeId = sizeVariant._id;

        const quantity = parseInt(req.body.quantity, 10) || 1;
        const totalPrice = product.salePrice * quantity;

        let cartDoc = await Cart.findOne({ userId });

        if (cartDoc) {

            const existingItemIndex = cartDoc.items.findIndex(
                item => item.productId.toString() === productId &&
                        item.variantId.toString() === variantId &&
                        item.sizeId.toString() === sizeId
            );

            if (existingItemIndex >= 0) {
                cartDoc.items[existingItemIndex].quantity += quantity;
                cartDoc.items[existingItemIndex].totalPrice += totalPrice;
            } else {
                cartDoc.items.push({
                    productId,
                    variantId,
                    sizeId,
                    quantity,
                    price: product.salePrice,
                    totalPrice,
                    color,
                    size
                });
            }

            await cartDoc.save();
        } else {
            cartDoc = new Cart({
                userId,
                items: [{
                    productId,
                    variantId,
                    sizeId,
                    quantity,
                    price: product.salePrice,
                    totalPrice,
                    color,
                    size
                }]
            });
            await cartDoc.save();
        }

        res.status(200).json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error("Error adding to cart", error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};




const removeCartItem = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId } = req.body;

        if (!userId) {
            return res.redirect('/login');
        }


        const cartDoc = await Cart.findOne({ userId });

        if (!cartDoc) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const updatedItems = cartDoc.items.filter(item => item.productId.toString() !== productId);
        
        if (updatedItems.length === cartDoc.items.length) {
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }

        cartDoc.items = updatedItems;
        await cartDoc.save();

        
        const totalAmount = cartDoc.items.reduce((sum, item) => sum + item.totalPrice, 0);

       
        res.json({
            success: true,
            message: 'Item removed from cart',
            totalAmount,
            remainingItems: cartDoc.items,
        });
    } catch (error) {
        console.error("Error removing item from cart:", error);
        res.status(500).json({ success: false, message: "Failed to remove item" });
    }
};


const updateCart = async (req, res) => {
    try {
        const { productId, newQuantity } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => item.productId._id.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        const product = await Product.findById(productId);
        const variant = product.variants.find(v => v.color === cartItem.color && v.sizes.some(s => s.size === cartItem.size));
        const sizeInfo = variant.sizes.find(s => s.size === cartItem.size);

        if (newQuantity < 1) {
            return res.status(400).json({ success: false, message: "Minimum quantity is 1" });
        }
        if (newQuantity > sizeInfo.stock) {
            return res.status(400).json({ success: false, message: sizeInfo.stock === 1 ? "Only one left!" : `Only ${sizeInfo.stock} left` });
        }

        cartItem.quantity = newQuantity;
        cartItem.totalPrice = cartItem.price * newQuantity;
        await cart.save();

        const totalAmount = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        res.json({ success: true, newQuantity, newSubtotal: cartItem.totalPrice, totalAmount });
    } catch (error) {
        console.error('Cart update error:', error);
        res.status(500).json({ success: false, message: 'Server error during cart update' });
    }
};
const updateCartItem = async (req, res) => {
    try {
        const { productId, size, color } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        // Find cart and populate product details
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        // Find product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Find variant and check size stock
        const variant = product.variants.find(v => v.color === color);
        if (!variant) {
            return res.status(400).json({ success: false, message: 'Invalid color variant' });
        }

        const sizeOption = variant.sizes.find(s => s.size === size);
        if (!sizeOption) {
            return res.status(400).json({ success: false, message: 'Size not available for this color' });
        }

        const isInStock = sizeOption.stock > 0;
        if (!isInStock) {
            return res.status(400).json({ success: false, message: 'Selected size is out of stock' });
        }

        const cartItemIndex = cart.items.findIndex(item => 
            item.productId._id.toString() === productId && item.color === color
        );
        if (cartItemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        cart.items[cartItemIndex].size = size;
        cart.items[cartItemIndex].inStock = isInStock;

        await cart.save();

        res.json({ 
            success: true, 
            message: 'Cart item updated successfully',
            item: {
                productId,
                size,
                color,
                inStock: isInStock
            }
        });
    } catch (error) {
        console.error('Cart item update error:', error);
        res.status(500).json({ success: false, message: 'Server error during cart item update' });
    }
};

module.exports = {
    loadCart,
    addCart,
    removeCartItem,
    updateCart,
    updateCartItem
};