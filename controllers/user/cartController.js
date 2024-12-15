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
            return res.render('cart', { cart: null, products: [], totalAmount: 0, user });
        }

        const totalAmount = cartItems.items.reduce((sum, item) => sum + item.totalPrice, 0);

        res.render('cart', { cart: cartItems, products: cartItems.items, totalAmount, user });
    } catch (error) {
        console.error("Error loading cart", error);
        res.redirect('/page-not-found');
    }
};

const addCart = async (req, res) => {
    try {
        const productId = req.body.productId;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const quantity = parseInt(req.body.quantity, 10) || 1;
        const totalPrice = product.salePrice * quantity;

        let cartDoc = await Cart.findOne({ userId });

        if (cartDoc) {
            const existingItemIndex = cartDoc.items.findIndex(item => item.productId.toString() === productId);

            if (existingItemIndex >= 0) {
                cartDoc.items[existingItemIndex].quantity += quantity;
                cartDoc.items[existingItemIndex].totalPrice += totalPrice;
            } else {
                cartDoc.items.push({
                    productId,
                    quantity,
                    price: product.salePrice,
                    totalPrice
                });
            }

            await cartDoc.save();
        } else {
            cartDoc = new Cart({
                userId,
                items: [{
                    productId,
                    quantity,
                    price: product.salePrice,
                    totalPrice
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

        cartDoc.items = cartDoc.items.filter(item => item.productId.toString() !== productId);

        await cartDoc.save();

        const totalAmount = cartDoc.items.reduce((sum, item) => sum + item.totalPrice, 0);
        
        res.json({
            success: true,
            message: 'Item removed from cart',
            totalAmount,
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
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated' 
            });
        }

        // Find the cart and validate
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }

        // Find the specific cart item
        const cartItemIndex = cart.items.findIndex(
            item => item.productId._id.toString() === productId
        );

        if (cartItemIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found in cart' 
            });
        }

        // Additional stock validation
        const product = cart.items[cartItemIndex].productId;
        if (newQuantity < 1 || newQuantity > product.quantity) {
            return res.status(400).json({ 
                success: false, 
                message: `Invalid quantity. Must be between 1 and ${product.quantity}` 
            });
        }

        // Update quantity and total price
        cart.items[cartItemIndex].quantity = newQuantity;
        cart.items[cartItemIndex].totalPrice = 
            cart.items[cartItemIndex].price * newQuantity;

        // Save updated cart
        await cart.save();

        // Recalculate total amount
        const totalAmount = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        res.json({ 
            success: true,
            newQuantity: newQuantity,
            newSubtotal: cart.items[cartItemIndex].totalPrice,
            totalAmount: totalAmount
        });

    } catch (error) {
        console.error('Cart update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during cart update' 
        });
    }
};


module.exports = {
    loadCart,
    addCart,
    removeCartItem,
    updateCart
};
