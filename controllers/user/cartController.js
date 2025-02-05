const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');

const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log(`Loading cart for user ID: ${userId}`);

        if (!userId) {
            console.log("User not logged in, redirecting to login page.");
            return res.redirect('/login');
        }

        const user = await User.findById(userId);
        console.log(`User details: ${JSON.stringify(user)}`);

        const cartItems = await Cart.findOne({ userId }).populate('items.productId');
        console.log(`Cart items retrieved: ${cartItems ? cartItems.items.length : 0}`);

        if (!cartItems || cartItems.items.length === 0) {
            console.log("Cart is empty, rendering empty cart page.");
            return res.render('cart', { cart: null, products: [], totalAmount: 0, user });
        }

        const totalAmount = cartItems.items.reduce((sum, item) => sum + item.totalPrice, 0);
        console.log(`Total amount for cart: ${totalAmount}`);

        res.render('cart', { cart: cartItems, products: cartItems.items, totalAmount, user });
    } catch (error) {
        console.error("Error loading cart", error);
        res.redirect('/page-not-found');
    }
};


const addCart = async (req, res) => {
    try {
        const { productId, size, color } = req.body;
        const userId = req.session.user;

        console.log(`Adding product to cart: User ID: ${userId}, Product ID: ${productId}, Size: ${size}, Color: ${color}`);

        if (!userId) {
            console.log("User not logged in, redirecting to login page.");
            return res.redirect('/login');
        }

        const product = await Product.findById(productId);
        if (!product) {
            console.log(`Product not found: ${productId}`);
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        console.log(`Product details: ${JSON.stringify(product)}`);

        const variant = product.variants.find(v => v.color === color);
        if (!variant) {
            console.log(`Variant color not found: ${color} for product ID: ${productId}`);
            return res.status(400).json({ success: false, message: "Variant color not found" });
        }

        const sizeVariant = variant.sizes.find(s => s.size === size);
        if (!sizeVariant) {
            console.log(`Size not found: ${size} for variant: ${color}`);
            return res.status(400).json({ success: false, message: "Size not found for selected variant" });
        }

        const variantId = variant._id;
        const sizeId = sizeVariant._id;
        console.log(`Variant ID: ${variantId}, Size ID: ${sizeId}`);

        const quantity = parseInt(req.body.quantity, 10) || 1;
        const totalPrice = product.salePrice * quantity;
        console.log(`Quantity: ${quantity}, Total Price: ${totalPrice}`);

        let cartDoc = await Cart.findOne({ userId });

        if (cartDoc) {
            console.log(`Found existing cart for user: ${userId}`);

            const existingItemIndex = cartDoc.items.findIndex(
                item => item.productId.toString() === productId &&
                        item.variantId.toString() === variantId &&
                        item.sizeId.toString() === sizeId
            );

            if (existingItemIndex >= 0) {
                console.log(`Item already exists in cart, updating quantity and total price.`);
                cartDoc.items[existingItemIndex].quantity += quantity;
                cartDoc.items[existingItemIndex].totalPrice += totalPrice;
            } else {
                console.log(`New item, adding to cart.`);
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
            console.log(`No existing cart found for user, creating new cart.`);
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

        console.log(`Product successfully added to cart.`);
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
            console.log("Unauthorized access attempt");
            return res.redirect('/login');
        }

        console.log(`User ${userId} attempting to remove product ${productId}`);
        const cartDoc = await Cart.findOne({ userId });

        if (!cartDoc) {
            console.log(`Cart not found for user ${userId}`);
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const updatedItems = cartDoc.items.filter(item => item.productId.toString() !== productId);
        
        if (updatedItems.length === cartDoc.items.length) {
            console.log(`Product ${productId} not found in cart`);
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }

        cartDoc.items = updatedItems;
        await cartDoc.save();

        
        const totalAmount = cartDoc.items.reduce((sum, item) => sum + item.totalPrice, 0);

        console.log(`Product ${productId} removed. New total amount: ${totalAmount}`);
        console.log(`Updated cart items:`, cartDoc.items); 
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
            console.log("Unauthorized cart update attempt");
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        console.log(`User ${userId} updating product ${productId} to quantity ${newQuantity}`);
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            console.log(`Cart not found for user ${userId}`);
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => item.productId._id.toString() === productId);
        if (!cartItem) {
            console.log(`Product ${productId} not found in cart`);
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
        console.log(`Cart updated: Product ${productId}, New Quantity: ${newQuantity}, Total Amount: ${totalAmount}`);

        res.json({ success: true, newQuantity, newSubtotal: cartItem.totalPrice, totalAmount });
    } catch (error) {
        console.error('Cart update error:', error);
        res.status(500).json({ success: false, message: 'Server error during cart update' });
    }
};

const updateCartItem = async (req, res) => {
    console.log('Received update request:', req.body);
    try {
        const { productId, size, color } = req.body;
        const userId = req.session.user;

        if (!userId) {
            console.log("Unauthorized cart item update attempt");
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            console.log(`Cart not found for user ${userId}`);
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            console.log(`Product ${productId} not found`);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const variant = product.variants.find(v => v.color === color && v.sizes.some(s => s.size === size));
        if (!variant) {
            console.log(`Invalid variant for product ${productId}`);
            return res.status(400).json({ success: false, message: 'Invalid size or color' });
        }

        const cartItemIndex = cart.items.findIndex(item => item.productId._id.toString() === productId && item.color === color);
        if (cartItemIndex === -1) {
            console.log(`Item ${productId} not found in cart`);
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        cart.items[cartItemIndex].size = size;
        await cart.save();
        console.log(`Cart item updated: Product ${productId}, New Size: ${size}`);

        res.json({ success: true, message: 'Cart item updated successfully' });
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