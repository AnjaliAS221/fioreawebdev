const User = require("../../models/userSchema");


const customerInfo = async(req,res)=>{
    try {
        let search = "";
        if(req.query.search){
            search = req.query.search;
        }
        let page = 1;
        if(req.query.page){
            page = req.query.page;
        }
        const limit = 3;
        const userData = await User.find({
            isAdmin: false,
            $or:[
                {name: {$regex: ".*" + search + ".*"}},
                {email: {$regex: ".*" + search + ".*"}}
            ],
        })

        .limit(limit*1)
        .skip((page-1)*limit)
        .exec();

        const count = await User.find({
            isAdmin: false,
            $or: [
                {name: {$regex: ".*" + search + ".*"}},
                {email: {$regex: ".*" + search + ".*"}}
            ],
        }).countDocuments();

        res.render('customers', {
            data: userData, 
            totalPages: Math.ceil(count / limit), 
            currentPage: parseInt(page), 
            search, 
            messages: req.flash()
        });

    } catch (error) {
        console.error("Error fetching customer info:", error);
        res.status(500).send("An error occurred.");
    }
}

const customerBlocked = async(req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({_id: id}, {$set: {isBlocked: true}});
        
        // Set a success message
        req.flash('success', 'Customer has been blocked successfully.');
        
        res.redirect("/admin/users");
    } catch (error) {
        req.flash('error', 'An error occurred while blocking the customer.');
        res.redirect("/admin/pageerror");
    }
};

const customerUnblocked = async(req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({_id: id}, {$set: {isBlocked: false}});
        
        // Set a success message
        req.flash('success', 'Customer has been unblocked successfully.');
        
        res.redirect("/admin/users");
    } catch (error) {
        req.flash('error', 'An error occurred while unblocking the customer.');
        res.redirect("/admin/pageerror");
    }
};


module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked,
}