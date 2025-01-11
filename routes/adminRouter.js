const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const bannerController = require("../controllers/admin/bannerController");
const stockController = require('../controllers/admin/stockController');
const salesController = require('../controllers/admin/salesController');
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const dashboardController = require('../controllers/admin/dashboardController');
const returnController = require('../controllers/admin/returnController');
const {adminAuth, userAuth} = require("../middlewares/auth");
const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({storage:storage});



//error management
router.get("/pageerror",adminController.pageerror);

//login management
router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/logout",adminController.logout);

//customer management
router.get("/users",adminAuth,customerController.customerInfo);
router.get("/blockCustomer",adminAuth,customerController.customerBlocked);
router.get("/unblockCustomer",adminAuth,customerController.customerUnblocked);

//category management
router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer);
router.post("/removeCategoryOffer",adminAuth,categoryController.removeCategoryOffer);
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getUnlistCategory);
router.get("/editCategory",adminAuth,categoryController.getEditCategory);
router.post("/editCategory/:id",adminAuth,categoryController.editCategory);



// Product management

router.get("/addProducts",adminAuth,productController.getProductAddPage);
router.post("/addProducts",adminAuth,uploads.array("images",4),productController.addProducts);
router.get("/products",adminAuth,productController.getAllProducts);
router.post("/addProductOffer",adminAuth,productController.addProductOffer);
router.post("/removeProductOffer",adminAuth,productController.removeProductOffer);
router.get("/blockProduct",adminAuth,productController.blockProduct);
router.get("/unblockProduct",adminAuth,productController.unblockProduct);
router.get("/editProduct",adminAuth,productController.getEditProduct);
router.post("/editProduct/:id",adminAuth,uploads.array("images",4),productController.editProduct);
router.post("/deleteImage",adminAuth,productController.deleteSingleImage);

//Banner management
router.get("/banner",adminAuth,bannerController.getBannerPage);
router.get("/addBanner",adminAuth,bannerController.getAddBannerPage);
router.post("/addBanner",adminAuth,uploads.single("images"),bannerController.addBanner);
router.get("/deleteBanner",adminAuth,bannerController.deleteBanner);

// stock management
router.get('/stocks',adminAuth,stockController.loadStock);
router.post('/update-stock',adminAuth,stockController.updateStock);
router.get("/search-products",adminAuth,stockController.searchProducts);


//order Controller
router.get('/orders', adminAuth, orderController.loadOrders);
router.post('/update-order-status', adminAuth, orderController.updateOrderStatus);
router.get('/getReturnRequest',adminAuth,orderController.getReturnPage);
router.post('/returnDataUpdate',adminAuth,orderController.returnRequest);


//coupon management
router.get("/coupon",adminAuth,couponController.loadCoupon);
router.post("/createCoupon",adminAuth,couponController.createCoupon);
router.get("/editCoupon",adminAuth,couponController.editCoupon);
router.post("/updateCoupon",adminAuth,couponController.updateCoupon);
router.get("/deleteCoupon",adminAuth,couponController.deleteCoupon);

//dashboard management
router.get("/",adminAuth,dashboardController.loadDashboard);
router.get('/generate-ledger',adminAuth, dashboardController.generateLedgerBook);

//sales management
router.get("/salesReport",adminAuth,salesController.loadSalesReport);
router.get('/salesReport/pdf',adminAuth, salesController.exportSalesToPDF);
router.get('/salesReport/excel',adminAuth, salesController.exportSalesToExcel);

// return management
router.get('/return-approvals',adminAuth,returnController.getReturnApprovals)
router.post('/returnDataUpdate',adminAuth,returnController.returnUpdate);


module.exports = router;