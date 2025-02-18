const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/userController.js");
const profileController = require("../controllers/user/profileController");
const productController = require("../controllers/user/productController");
const filterController = require("../controllers/user/filterController");
const cartController = require('../controllers/user/cartController');
const wishlistController = require('../controllers/user/wishlistController');
const walletController = require("../controllers/user/walletController");
const invoiceController = require("../controllers/user/invoiceController");
const orderController = require("../controllers/user/orderController");
const paymentController = require("../controllers/user/paymentController");
const couponController = require("../controllers/user/couponController");
const {userAuth} = require("../middlewares/auth");
const User = require('../models/userSchema.js')


router.use(async(req,res,next)=>{
    if(req.session.user){
        const user = await User.findById(req.session.user)
        res.locals.user = user;
    }
    next();
})


//Error management
router.get("/pageNotFound",userController.pageNotFound);

// signup management
router.get('/',userController.loadHomepage);
router.get('/signup',userController.loadSignup);
router.post('/signup',userController.signup);
router.post("/verify-otp",userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);

//social media signup
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    req.session.user = req.user;
    res.redirect('/')
});

// login management
router.get('/login',userController.loadLogin);
router.post('/login',userController.login);

//logout management
router.get('/logout',userController.logout);

//profile management
router.get("/forgot-password",profileController.getForgotPassPage);
router.post("/forgot-email-valid",profileController.forgotEmailValid);
router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/reset-password",profileController.postNewPassword);
router.get("/userProfile",userAuth,profileController.userProfile);
router.get("/change-email",userAuth,profileController.changeEmail);
router.post("/change-email",userAuth,profileController.changeEmailValid);
router.post("/verify-email-otp",userAuth,profileController.verifyEmailOtp);
router.post("/update-email",userAuth,profileController.updateEmail);
router.get("/change-password",userAuth,profileController.changePassword);
router.post("/change-password",userAuth,profileController.changePasswordValid);
router.post("/verify-changepassword-otp",userAuth,profileController.verifyChangePassOtp);
router.post("/update-profile",userAuth,profileController.updateProfile);

// Address management
router.get("/addAddress",userAuth,profileController.addAddress);
router.post("/addAddress",userAuth,profileController.postAddAddress);
router.get("/editAddress",userAuth,profileController.editAddress);
router.post("/editAddress",userAuth,profileController.postEditAddress);
router.get("/deleteAddress",userAuth,profileController.deleteAddress);


//shopping management
router.get("/shop",productController.loadShoppingPage);
router.post("/search",productController.searchProducts);

//product management
router.get("/productDetails",productController.productDetails);

// filtering products
router.post('/sort-and-search',filterController.sortSearch)

//cart management
router.get('/cart',userAuth,cartController.loadCart);
router.post('/add-to-cart',userAuth,cartController.addCart);
router.post('/remove-cart-item',userAuth,cartController.removeCartItem);
router.post('/update-cart-quantity', userAuth,cartController.updateCart);
router.post('/update-cart-item',userAuth,cartController.updateCartItem);

//order management
router.get('/checkout',userAuth, orderController.loadCheckout);
router.get('/order-confirmation',userAuth, orderController.orderConfirm);
router.post('/cancel-order',userAuth, orderController.cancelOrder);
router.get('/order-history',userAuth,orderController.orderHistory);
router.post('/place-order-initial',userAuth,orderController.placeOrderInitial);
router.post('/return-order',orderController.returnOrder);

//payment management
router.post('/create-order',userAuth,paymentController.createOrder)
router.post('/place-order',userAuth,paymentController.placeOrder);
router.post('/verify-payment',userAuth,paymentController.verifyPayment);
router.get('/payment-failed', userAuth, paymentController.paymentFailed);
router.post('/update-failed-order', userAuth, paymentController.updateFailedOrder);
router.post('/retry-payment',userAuth,paymentController.retryPayment);




//wishlist management 
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/toggleWishlist',userAuth,wishlistController.toggleWishlist);
router.get('/get-wishlist', userAuth, wishlistController.getWishlist);
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct);
router.get('/getProductDetails/:id', userAuth, wishlistController.getProductDetails);
router.post('/addToCartFromWishlist', userAuth, wishlistController.addToCart);

//coupon management
router.get('/coupons', userAuth, couponController.loadCoupons);
router.post('/applyCoupon', userAuth, couponController.applyCoupon);
router.post('/removeCoupon', userAuth, couponController.removeCoupon);


// wallet management
router.get('/wallet', userAuth, walletController.loadWallet);
router.post('/create-wallet', userAuth, walletController.createWallet);
router.post('/verify-wallet', userAuth, walletController.verifyWallet);

//invoice
router.get('/download-invoice/:orderId', userAuth, invoiceController.generateInvoice);




module.exports = router;