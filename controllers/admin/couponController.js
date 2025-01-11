const Coupon = require("../../models/couponSchema");
const mongoose = require("mongoose");



const loadCoupon = async(req,res)=>{
    try {
        
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        const skip = (page - 1) * limit;

        const totalCoupons = await Coupon.countDocuments({});
        const totalPages = Math.ceil(totalCoupons / limit);

        const findCoupons = await Coupon.find({})
        .sort({ createdOn: -1 }) 
        .skip(skip)
        .limit(limit);

        const message = req.session.message;
        const error = req.session.error;
        
       
        delete req.session.message;
        delete req.session.error;

        return res.render("coupon",{
            coupons:findCoupons,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            lastPage: totalPages,
            message: message,
            error: error
        });

    } catch (error) {
        console.error("Error in loadCoupon:", error);
        req.session.error = "Failed to load coupons";
        return res.redirect("/pageerror");
    }
}


const createCoupon = async(req,res)=>{
    try {
        const data = {
            couponName : req.body.couponName,
            startDate : new Date(req.body.startDate + "T00:00:00"),
            endDate : new Date(req.body.endDate + "T00:00:00"),
            offerPrice : parseInt(req.body.offerPrice),
            minimumPrice : parseInt(req.body.minimumPrice),
        }


        const existingCoupon = await Coupon.findOne({ name: data.couponName });
        if (existingCoupon) {
            req.session.error = "Coupon with this name already exists";
            return res.redirect("/admin/coupon");
        }

        const newCoupon = new Coupon({
            name : data.couponName,
            createdOn : data.startDate,
            expireOn : data.endDate,
            offerPrice : data.offerPrice,
            minimumPrice : data.minimumPrice,
        });

        await newCoupon.save();
        req.session.message = "Coupon created successfully";
        return res.redirect("/admin/coupon");

    } catch (error) {
        console.error("Error creating coupon:", error);
        req.session.error = "Failed to create coupon";
        res.redirect("/admin/pageerror");
    }
}


const editCoupon = async(req,res)=>{
    try {
        const id = req.query.id;
        const findCoupon = await Coupon.findOne({_id:id});

        if (!findCoupon) {
            req.session.error = "Coupon not found";
            return res.redirect("/admin/coupon");
        }

        res.render('edit-coupon',{
            findCoupon : findCoupon,
            message: req.session.message,
            error: req.session.error
        });

        delete req.session.message;
        delete req.session.error;

    } catch (error) {
        console.error("Error editing coupon:", error);
        req.session.error = "Failed to load coupon for editing";
        res.redirect("/admin/coupon");
    }
}

const updateCoupon = async(req,res)=>{
    try {
        const couponId = req.body.couponId;
        const oid = new mongoose.Types.ObjectId(couponId);
        const selectedCoupon = await Coupon.findOne({_id:oid});
        
        if(selectedCoupon){
            const startDate = new Date(req.body.startDate);
            const endDate = new Date(req.body.endDate);
            const updateCoupon = await Coupon.updateOne(
                {_id:oid},
                {
                    $set: {
                        name: req.body.couponName,
                        createdOn: startDate,
                        expireOn: endDate,
                        offerPrice: parseInt(req.body.offerPrice),
                        minimumPrice: parseInt(req.body.minimumPrice),
                    },
                }
            );

            if(updateCoupon.modifiedCount > 0){
                req.session.message = "Coupon updated successfully";
                res.send({ success: true, message: "Coupon updated successfully" });
            } else {
                res.status(500).send({ success: false, message: "No changes made to coupon" });
            }
        } else {
            res.status(404).send({ success: false, message: "Coupon not found" });
        }
    } catch (error) {
        console.error("Error updating coupon:", error);
        res.status(500).send({ success: false, message: "Failed to update coupon" });
    }
}



const deleteCoupon = async(req,res)=>{
    try {
        const id = req.query.id;
        const result = await Coupon.deleteOne({_id:id});
        if (result.deletedCount > 0) {
            res.status(200).send({success: true, message: "Coupon deleted successfully"});
        } else {
            res.status(404).send({success: false, message: "Coupon not found"});
        }
    } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).send({success: false, message: "Failed to delete coupon"});
    }
}
module.exports = {
    loadCoupon,
    createCoupon,
    editCoupon,
    updateCoupon,
    deleteCoupon,
}