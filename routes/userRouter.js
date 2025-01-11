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
const referralController = require("../controllers/user/referralController");
const invoiceController = require("../controllers/user/invoiceController");
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
router.get("/shop",userAuth,userController.loadShoppingPage);
router.post("/search",userAuth,userController.searchProducts);


//product management
router.get("/productDetails",userAuth,productController.productDetails);
router.get('/all-products',userAuth,productController.getAllProducts);

// filtering products
router.post('/sort-and-search',filterController.sortSearch)

//cart management
router.get('/cart',userAuth,cartController.loadCart);
router.post('/add-to-cart',userAuth,cartController.addCart);
router.post('/remove-cart-item',userAuth,cartController.removeCartItem);
router.post('/update-cart-quantity', userAuth,cartController.updateCart);

//order management
router.get('/checkout',userAuth, productController.loadCheckout);
router.get('/order-confirmation',userAuth, productController.orderConfirm);
router.post('/cancel-order',userAuth, productController.cancelOrder);
router.get('/order-history',userAuth,productController.orderHistory);
router.post('/place-order-initial',userAuth,productController.placeOrderInitial);
router.post('/create-order',userAuth,productController.createOrder)
router.post('/place-order',userAuth,productController.placeOrder);
router.post('/return-order',productController.returnOrder);


router.post('/update-failed-order', userAuth, productController.updateFailedOrder);
router.post('/retry-payment',userAuth,productController.retryPayment);
router.post('/verify-payment',userAuth,productController.verifyPayment);

//wishlist management 
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist);
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct);

//coupon management
router.post('/applyCoupon', userAuth, productController.applyCoupon);
router.post('/removeCoupon', userAuth, productController.removeCoupon);
router.get('/coupons', userAuth, productController.loadCoupons);

// wallet management
router.get('/wallet', userAuth, walletController.loadWallet);
router.post('/create-wallet', userAuth, walletController.createWallet);
router.post('/verify-wallet', userAuth, walletController.verifyWallet);


//referal management
router.get('/referrals',userAuth,referralController.loadDashboard);

//invoice
router.get('/download-invoice/:orderId', userAuth, invoiceController.generateInvoice);




module.exports = router;