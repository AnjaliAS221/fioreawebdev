const Return = require("../../models/returnSchema");
const Wallet = require("../../models/walletSchema");
const Order = require("../../models/orderSchema");
const Notification = require("../../models/notificationSchema");

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

        console.log('Return ID:', returnId);  
        console.log('Status:', status);      

        
        if (!returnId) {
            console.log('No return ID provided');  
            return res.status(400).send('Return ID is required');
        }

        if (!status || !['Approved', 'Rejected'].includes(status)) {
            console.log('Invalid status:', status);  
            return res.status(400).send('Invalid status value');
        }

        
        const returnData = await Return.findById(returnId);
        console.log('Return Data:', returnData);
        if (!returnData) {
            console.log('Return not found for ID:', returnId);  
            return res.status(404).send('Return request not found');
        }

      
        if (returnData.status !== 'Pending') {
            console.log('Return already processed:', returnData.status);  
            return res.status(400).send('Return request already processed');
        }

        const userId = returnData.userId;
        const orderId = returnData.orderId;
        const amount = returnData.refundAmount;

        if (status === 'Approved') {
            try {
                
                let wallet = await Wallet.findOne({ userId });
                
                if (!wallet) {
                    
                    wallet = new Wallet({
                        userId,
                        balance: amount,
                        transactions: [{
                            type: 'credit',
                            amount: amount,
                            description: 'Refund for your returned product',
                            orderId,
                            date: new Date()
                        }]
                    });
                    await wallet.save();
                } else {
                    
                    await Wallet.findOneAndUpdate(
                        { userId },
                        {
                            $inc: { balance: amount },
                            $push: {
                                transactions: {
                                    type: 'credit',
                                    amount: amount,
                                    description: 'Refund for your returned product',
                                    orderId,
                                    date: new Date()
                                }
                            }
                        }
                    );
                }

                
                returnData.status = status;
                returnData.approvedAt = new Date();
                console.log('Before Save:', returnData);
                await returnData.save();
                console.log('After Save:', returnData);

                
                await Notification.findOneAndUpdate(
                    { userId },
                    {
                        userId,
                        message: 'Your Return Request Has Been Approved, Amount Is Added To Your Wallet',
                        status: 'unread',
                        createdAt: new Date()
                    },
                    { upsert: true, new: true }
                );

                
                await Order.findByIdAndUpdate(
                    orderId,
                    { status: 'Return Request Approved' }
                );

            } catch (error) {
                console.error('Error in approval process:', error);  
                return res.status(500).send('Error processing approval');
            }
        } else {
            try {
                
                returnData.status = status;
                returnData.rejectedAt = new Date();
                await returnData.save();

                
                await Notification.findOneAndUpdate(
                    { userId },
                    {
                        userId,
                        message: 'Your Return Request Is Rejected',
                        status: 'unread',
                        createdAt: new Date()
                    },
                    { upsert: true, new: true }
                );

                
                await Order.findByIdAndUpdate(
                    orderId,
                    { status: 'Return Request Rejected' }
                );

            } catch (error) {
                console.error('Error in rejection process:', error);  
                return res.status(500).send('Error processing rejection');
            }
        }

        return res.redirect('/return-approvals');

    } catch (error) {
        console.error('Error in return update:', error);  
        return res.status(500).send('Internal server error');
    }
};


module.exports = {
    getReturnApprovals,
    returnUpdate
};