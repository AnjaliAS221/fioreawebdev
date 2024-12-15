
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');



const handleError = (res, error, customMessage = 'An error occurred') => {
    console.error(customMessage, error);
    res.status(500).render('page-404', { message: customMessage });
};

const productDetails = async(req,res)=>{
    try {
        const userId = req.session.user;
        console.log('the userId',userId);
        const userData = await User.findById(userId);
        console.log('The userData',userData);

        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;

        const categoryOffer = findCategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        const colors = product.colors || [];
        const sizes = product.sizes || [];

        res.render("product-details",{
            user:userData,
            product:product,
            quantity:product.quantity,
            totalOffer:totalOffer,
            category:findCategory,
            colors: colors,
            sizes: sizes
        });
    } catch (error) {
        console.error("Error  fetching product details",error);
        res.redirect("/pageNotFound");
    }
}

const getAllProducts = async (req, res) => {
    try {
        const limit = 16;
        const page = Math.max(1, parseInt(req.query.page) || 1);

        const [products, count, categories] = await Promise.all([
            Product.find({ isBlocked: false })
                .limit(limit)
                .skip((page - 1) * limit),
            Product.countDocuments(),
            Category.find({ isListed: false })
        ]);

        const totalPages = Math.ceil(count / limit);

        res.render('all-products', {
            products,
            categories,
            totalPages,
            currentPage: page
        });
    } catch (error) {
        handleError(res, error, 'Error loading all products');
    }
};

const loadCheckout = async (req, res) => {
    try {
      const user = req.session.user;
  
    
  
      const addressDoc = await Address.findOne({ userId: user });
      const addresses = addressDoc ? addressDoc.address : [];
  
      let totalPrice = 0;
      const productId=req.query.id;

      const availableCoupons = await Coupon.find({
        expireOn: { $gt: new Date() }, 
        isList: true
    });


      if (productId) {
        const product = await Product.findOne({_id:productId,});

        if (!product) {
          return res.status(400).json({message:"Product not found"});
        }

        totalPrice = product.salePrice;

        return res.render('checkout',{
            cart:null,
            products: null, 
            address: addresses, 
            totalPrice,
            totalPrice, product: product,
            availableCoupons: availableCoupons
        })
       
      }else{
        const cartItems = await Cart.findOne({ userId: user }).populate('items.productId');
        if (!cartItems) {
          return res.status(400).json({success:false,message:"cart is empty"});
        }

        totalPrice = cartItems.items.reduce((sum, item) => sum + item.totalPrice, 0);

        return res.render('checkout', { 
            cart: cartItems, 
            products: cartItems.items, 
            address: addresses, 
            totalPrice,
            product: null ,
            availableCoupons: availableCoupons
        });
      }
    } catch (error) {
      console.error("Checkout load error:", error);
      res.redirect('/pageNotFound');
    }
  };



  const applyCoupon = async (req, res) => {
    try {
        const { couponCode, totalPriceAmt } = req.body;
        
        const userId = req.session.user;
        
        const coupon = await Coupon.findOne({ 
            name: couponCode, 
            expireOn: { $gt: new Date() },
            isList: true,
            minimumPrice: { $lte: totalPriceAmt }
        });

        if (!coupon) {
            return res.json({ 
                success: false, 
                message: 'Invalid or expired coupon' 
            });
        }

        // Check coupon usage limit
        const couponUsageCount = await Order.countDocuments({
            user: userId,
            'couponApplied.couponId': coupon._id
        });

        if (couponUsageCount >= coupon.usageLimit) {
            return res.json({
                success: false,
                message: 'Coupon usage limit exceeded'
            });
        }

        const discountedPrice = Math.max(
            totalPriceAmt - coupon.offerPrice, 
            0
        );

        return res.json({
            success: true,
            message: 'Coupon applied successfully',
            originalPrice: totalPriceAmt,
            discountedPrice: discountedPrice,
            couponDiscount: coupon.offerPrice
        });
    } catch (error) {
        console.error('Coupon application error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error applying coupon' 
        });
    }
}

  const placeOrderInitial = async (req, res) => {
    try {

        const { 
             cart,
             singleProduct,
             totalPrice,
             addressId, 
             payment_method,
             couponDiscount,
             originalPrice,
             discount,
            
             
            } = req.body;

            console.log(discount);
       
        if (!req.session.user) {
            console.error('Authentication Error: User not authenticated');
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated',
                errorType: 'AuthenticationError'
            });
        }



        if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
            console.error('Validation Error: Invalid Address ID');
            return res.status(400).json({
                success: false,
                message: 'Invalid Address ID',
                errorType: 'ValidationError'
            });
        }

        if ( !payment_method || (!cart && !singleProduct)) {
            console.error('Validation Error: Invalid order details', { 
                addressId, 
                payment_method, 
                cart, 
                singleProduct 
            });
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid order details',
                errorType: 'ValidationError'
            });
        }

        const user = req.session.user;
        let orderItems = [];
        ;

        // Process single product order
        if (singleProduct) {
            const productData = typeof singleProduct === 'string' 
                ? JSON.parse(singleProduct) 
                : singleProduct;

            console.log('Single Product Order:', productData);

            const product = await Product.findById(productData._id);
            if (!product) {
                console.error('Product Not Found:', productData._id);
                return res.status(404).json({ 
                    success: false, 
                    message: 'Product not found',
                    errorType: 'ProductNotFound'
                });
            }

            orderItems.push({
                product: productData._id,
                quantity: 1,
                price: productData.salePrice
            });
        } 
        // Process cart order
        else if (cart) {
            const parsedCart = typeof cart === 'string' ? JSON.parse(cart) : cart;

            for (const item of parsedCart) {
                const product = await Product.findById(item.productId);
                if (!product) {
                    console.error('Product Not Found in Cart:', item.productId);
                    return res.status(404).json({ 
                        success: false, 
                        message: `Product ${item.productId} not found`,
                        errorType: 'ProductNotFound'
                    });
                }

                orderItems.push({
                    product: product._id,
                    quantity: item.quantity,
                    price: product.salePrice * item.quantity
                });
            }
        }


        const userAddress = await Address.findOne(
            { "address._id": addressId },
            { "address.$": 1 }
        );


        if (!userAddress || !userAddress.address || userAddress.address.length === 0) {
            console.error('Address Not Found:', addressId);
            return res.status(404).json({
                success: false,
                message: 'Address not found',
                errorType: 'AddressNotFound'
            });
        }

        const shippingAddress = userAddress.address[0];
        console.log('Shipping Address Fetched:', shippingAddress);

        // Create and save order
        const newOrder = new Order({
            user,
            orderedItems: orderItems,
            totalPrice: originalPrice || finalAmount,
            couponDiscount: discount || 0,
            finalAmount:discount
            ? (finalAmount - discount) 
                : finalAmount,
            status: 'Pending',
            address: shippingAddress,
            paymentMethod: payment_method,
            paymentStatus: 'pending'
        });

        await newOrder.save();

        console.log('Order Created Successfully:', newOrder._id);

        res.json({
            success: true,
            orderId: newOrder._id,
            orderNumber: `ORD-${newOrder._id.toString().slice(-8).toUpperCase()}`
        });

    } catch (error) {
        console.error('Detailed Order Placement Error:', error);
        
        res.status(500).json({ 
            success: false, 
            message: 'Order placement failed',
            errorType: 'ServerError',
            errorDetails: error.message 
        });
    }
};


  const orderConfirm = async (req, res) => {
    try {
  
      const id = req.query.id
      const order = await Order.findById(id);
      res.render('order-confirmation',{order});
  
    } catch (error) {
      console.error("Error loading cofirmation page", error);
      res.redirect('/page-not-found');
    }
  }



  const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.status = 'Cancelled';
        await order.save();

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        handleError(res, error, 'Error cancelling order');
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
};

  
const orderHistory = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const orders = await Order.find({user: user})
            .populate(['orderedItems.product', 'address'])
            .sort({ createdAt: -1 });

        res.render('order-details', {
            orders,
        });
    } catch (error) {
        handleError(res, error, 'Error fetching order history');
    }
};


const removeCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user;

        // Validate input
        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        // Find the coupon to ensure it exists
        const coupon = await Coupon.findOne({ name: couponCode });
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // If using cart-based approach
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Remove coupon details from cart
        cart.couponApplied = null;
        cart.couponDiscount = 0;
        await cart.save();

        // Calculate original total price
        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

        return res.json({
            success: true,
            message: 'Coupon removed successfully',
            totalPrice: totalPrice
        });
    } catch (error) {
        console.error('Remove coupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing coupon',
            error: error.message
        });
    }
};

const loadCoupons = async (req, res) => {
    try {
        const userId = req.session.user;

        // Fetch available coupons
        const availableCoupons = await Coupon.find({
            expireOn: { $gt: new Date() }, // Not expired
            isList: true,
            minimumPrice: { $exists: true } // Has a minimum purchase requirement
        });

        // Optional: Filter out coupons already used by the user
        const usedCouponIds = await Order.distinct('couponApplied.couponId', { user: userId });
        
        const filteredCoupons = availableCoupons.filter(coupon => 
            !usedCouponIds.includes(coupon._id)
        );

        // Prepare coupon data
        const couponData = filteredCoupons.map(coupon => ({
            name: coupon.name,
            offerPrice: coupon.offerPrice,
            minimumPrice: coupon.minimumPrice,
            expireOn: coupon.expireOn,
            description: coupon.description || 'No description available'
        }));

        // If it's an API request
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.json({
                success: true,
                coupons: couponData
            });
        }

        // If it's a page render
        return res.render('coupon-list', {
            coupons: couponData,
            title: 'Available Coupons'
        });
    } catch (error) {
        console.error('Load coupons error:', error);
        
        // If it's an API request
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Error loading coupons',
                error: error.message
            });
        }

        // If it's a page render
        return res.status(500).render('error', {
            message: 'Unable to load coupons',
            error: error
        });
    }
};





module.exports = {
    productDetails,
    loadCheckout,
    getAllProducts,
    placeOrderInitial,
    orderConfirm,
    cancelOrder,
    orderHistory,
    applyCoupon,
    removeCoupon,
    loadCoupons
}