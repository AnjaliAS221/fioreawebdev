const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');

const loadCoupons = async (req, res) => {
    try {
        const userId = req.session.user;

        const availableCoupons = await Coupon.find({
            expireOn: { $gt: new Date() },
            isList: true,
            minimumPrice: { $exists: true }
        });

        const usedCouponIds = await Order.distinct('couponApplied.couponId', { user: userId });

        const filteredCoupons = availableCoupons.filter(coupon =>
            !usedCouponIds.includes(coupon._id)
        );

        const couponData = filteredCoupons.map(coupon => ({
            name: coupon.name,
            offerPrice: coupon.offerPrice,
            minimumPrice: coupon.minimumPrice,
            expireOn: coupon.expireOn,
            description: coupon.description || 'No description available'
        }));

        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.json({
                success: true,
                coupons: couponData
            });
        }

        return res.render('coupon-list', {
            coupons: couponData,
            title: 'Available Coupons'
        });
    } catch (error) {
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Error loading coupons',
                error: error.message
            });
        }

        return res.status(500).render('error', {
            message: 'Unable to load coupons',
            error: error
        });
    }
};

const applyCoupon = async (req, res) => {
    try {
        let { couponCode, totalPriceAmt } = req.body;
        const userId = req.session.user;
        totalPriceAmt = Number(totalPriceAmt);

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
            couponDiscount: coupon.offerPrice,
            couponCode: couponCode,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error applying coupon'
        });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user;

        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        const coupon = await Coupon.findOne({ name: couponCode });
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        cart.couponApplied = null;
        cart.couponDiscount = 0;
        await cart.save();

        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

        return res.json({
            success: true,
            message: 'Coupon removed successfully',
            totalPrice: totalPrice,
            couponDiscount: 0,
            finalAmount: totalPrice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error removing coupon',
            error: error.message
        });
    }
};

module.exports = {
    applyCoupon,
    removeCoupon,
    loadCoupons,
};
