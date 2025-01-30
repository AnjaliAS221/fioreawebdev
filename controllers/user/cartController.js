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
        const { productId, size, color } = req.body;  
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // 🔥 Find the correct variant based on color and size
        const variant = product.variants.find(v => v.color === color);
        
        if (!variant) {
            return res.status(400).json({ success: false, message: "Variant color not found" });
        }

        const sizeVariant = variant.sizes.find(s => s.size === size);
        if (!sizeVariant) {
            return res.status(400).json({ success: false, message: "Size not found for selected variant" });
        }

        const variantId = sizeVariant._id;  // ✅ Extracted variant ID
        
        const quantity = parseInt(req.body.quantity, 10) || 1;
        const totalPrice = product.salePrice * quantity;

        let cartDoc = await Cart.findOne({ userId });

        if (cartDoc) {
            
            const existingItemIndex = cartDoc.items.findIndex(
                item => item.productId.toString() === productId && 
                        item.variantId.toString() === variantId
            );

            if (existingItemIndex >= 0) {
                cartDoc.items[existingItemIndex].quantity += quantity;
                cartDoc.items[existingItemIndex].totalPrice += totalPrice;
            } else {
                console.log("variants",variantId);
                cartDoc.items.push({
                    productId,
                    variantId,  // ✅ Now storing the variantId
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
                    variantId,  // ✅ Now storing the variantId
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

  
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }

        const cartItem = cart.items.find(
            item => item.productId._id.toString() === productId
        );

        if (!cartItem) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found in cart' 
            });
        }

  
        const product = await Product.findById(productId);
        const variant = product.variants.find(v => 
            v.color === cartItem.color && 
            v.sizes.some(s => s.size === cartItem.size)
        );

        const sizeInfo = variant.sizes.find(s => s.size === cartItem.size);
        
        if (newQuantity < 1) {
            return res.status(400).json({ 
                success: false, 
                message: "Minimum quantity is 1"
            });
        }
        
        if (newQuantity > sizeInfo.stock) {
            return res.status(400).json({ 
                success: false, 
                message: sizeInfo.stock === 1 
                    ? "Sorry, only one item left in stock!" 
                    : sizeInfo.stock < 5 
                        ? `Only a few items left (${sizeInfo.stock} remaining)` 
                        : "Maximum quantity reached for this item"
            });
        }

       
        cartItem.quantity = newQuantity;
        cartItem.totalPrice = cartItem.price * newQuantity;

        await cart.save();

        
        const totalAmount = cart.items.reduce((total, item) => total + item.totalPrice, 0);

        res.json({ 
            success: true,
            newQuantity: newQuantity,
            newSubtotal: cartItem.totalPrice,
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

const updateCartItem = async (req, res) => {
    console.log('Received update request:', {
        productId: req.body.productId,
        size: req.body.size,
        color: req.body.color
    });

    
    try {
        const { productId, size, color } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated' 
            });
        }

        // Find the cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }

        // Find the product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }

        // Validate the new size and color combination
        const variant = product.variants.find(v => 
            v.color === color && 
            v.sizes.some(s => s.size === size)
        );

        if (!variant) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid size or color combination' 
            });
        }

        // Find the specific cart item to update
        const cartItemIndex = cart.items.findIndex(
            item => item.productId._id.toString() === productId && 
                    item.color === color
        );

        if (cartItemIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found in cart' 
            });
        }

        // Update the cart item
        cart.items[cartItemIndex].size = size;

        // Save the updated cart
        await cart.save();

        res.json({ 
            success: true,
            message: 'Cart item updated successfully' 
        });

    } catch (error) {
        console.error('Cart item update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during cart item update' 
        });
    }
};
module.exports = {
    loadCart,
    addCart,
    removeCartItem,
    updateCart,
    updateCartItem
};