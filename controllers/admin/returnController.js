const Return = require("../../models/returnSchema");
const Wallet = require("../../models/walletSchema");
const Order = require("../../models/orderSchema");
const Notification = require("../../models/notificationSchema");
const { Transaction } = require("mongodb");


const getReturnApprovals = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6; 
        const skip = (page - 1) * limit;

        const totalReturns = await Return.countDocuments();
        const totalPages = Math.ceil(totalReturns / limit);

        const returnData = await Return.find()
            .populate('orderId userId')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 }); 

        res.render('returnOrder', {
            returns: returnData,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        });
    } catch (error) {
        console.error('Error fetching return approvals:', error);
        res.status(500).send('Server error');
    }
};

const returnUpdate = async (req, res) => {
    try {
        const returnId = req.query.id;
        const { status } = req.body;


        const returnData = await Return.findById(returnId);
        if (!returnData) {
            return res.status(404).json({ message: "Return request not found" });
        }

        const userId = returnData.userId;
        const orderId = returnData.orderId;
        const amount = returnData.refundAmount;

        if (status === "Approved") {
            try {
                let wallet = await Wallet.findOne({ userId });
                
                if (!wallet) {
                    wallet = new Wallet({
                        userId,
                        balance: 0,
                        transactions: []
                    });
                    await wallet.save();
                }
       
                await Wallet.findOneAndUpdate(
                    { userId },
                    { 
                        $inc: { balance: amount },
                        $push: {
                            transactions: {
                                type: 'credit',
                                amount: amount,
                                description: "Refund for your returned product",
                                orderId,
                                date: new Date()
                            }
                        }
                    }
                );

                returnData.returnStatus = status;
                await returnData.save();

                let notification = await Notification.findOne({userId});

                if(!notification){
                    notification = new Notification({
                        userId,
                        message:"Your Return Request Has Been Approved, Amount Is Added To Your Wallet",
                        status:"unread",
                    })
                    await notification.save()
                }else{
                    await Notification.findOneAndUpdate({userId},{
                        message:"Your Return Request Has Been Approved, Amount Is Added To Your Wallet",
                        status:"unread",
                        createdAt:Date.now()
                    })
                }
                await Order.findOneAndUpdate(
                    { _id: orderId },
                    { $set: { status: "Return Request Approved" } }
                );
            } catch (error) {
                console.error("Error in updating wallet and return status:", error);
                return res.status(500).json({ message: "Internal server error" });
            }
        } else if (status === "Rejected") {
            try {
                returnData.returnStatus = status;
                await returnData.save();

                let notifications = await Notification.findOne({userId});

                if(!notifications){
                    notification = new Notification({
                        userId,
                        message:"Your Return Order Is Rejected",
                        status:"unread"
                    })
                    await notification.save()
                }else{
                    await Notification.findByIdAndUpdate({userId},{
                        message:"Your Return Request Is Rejected",
                        userId,
                        status:"unread",
                        createdAt:Date.now()
                    })
                }
                await Order.findOneAndUpdate(
                    { _id: orderId },
                    { $set: { status: "Return Request Rejected" } }
                );

            } catch (error) {
                console.error("Error in rejecting return status:", error);
                return res.status(500).json({ message: "Internal server error" });
            }
        } else {
            return res.status(400).json({ message: "Invalid status value" });
        }
        
        return res.redirect(`/admin/return-approvals`);
        
    } catch (error) {
        console.error("Error in Updating Return Status:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


module.exports={
    getReturnApprovals,
    returnUpdate
}