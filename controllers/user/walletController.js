const Wallet=require('../../models/walletSchema')
const env = require('dotenv').config()
const crypto = require('crypto');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user; 
        if (!userId) {
            return res.redirect('/login');
        }

       
        const page = parseInt(req.query.page) || 1; 
        const limit = parseInt(req.query.limit) || 5; 
        const skip = (page - 1) * limit;

       
        const wallet = await Wallet.findOne({ userId }).populate('transactions.orderId').lean();

        if (!wallet) {
            return res.render('wallet', {
                balance: 0,
                transactions: [],
                currentPage: page,
                totalPages: 0,
                limit,
                keyId:process.env.RAZORPAY_KEY_ID

            });
        }

        const totalTransactions = wallet.transactions.length; 
        const paginatedTransactions = wallet.transactions
            .slice()
            .reverse()
            .slice(skip, skip + limit); 

        const totalPages = Math.ceil(totalTransactions / limit); 

        res.render('wallet', {
            balance: wallet.balance || 0,
            transactions: paginatedTransactions,
            currentPage: page,
            totalPages,
            limit,
            keyId:process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error loading wallet page:', error);
        res.redirect('/pageNotFound');
    }
};






const createWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const amount = Math.round(parseFloat(req.body.amount) * 100); 
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const timestamp = Date.now().toString().slice(-8); 
        const shortUserId = userId.toString().slice(-4); 
        const receipt = `w${shortUserId}${timestamp}`; 

        const options = {
            amount: amount,
            currency: "INR",
            receipt: receipt, 
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);
        req.session.walletAmount = amount; 

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating wallet order:', error);
        res.status(500).json({ success: false, message: 'Error creating order', error: error.message });
    }
};

const verifyWallet = async (req, res) => {
    try {
        const { paymentId, orderId, signature } = req.body;
        const userId = req.session.user;
        const amount = req.session.walletAmount / 100; 

        if (!userId || !amount) {
            return res.status(400).json({ success: false, message: 'Invalid session data' });
        }

      
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(orderId + "|" + paymentId);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        const transaction = {
            type: 'Deposit',
            amount: amount,
            status: 'Completed',
            date: new Date(),
            description: 'Wallet top-up'
        };

        
        const wallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $inc: { balance: amount },
                $push: { transactions: transaction },
                $set: { lastUpdated: new Date() }
            },
            { new: true, upsert: true }
        );

        
        req.session.walletAmount = null;

        res.status(200).json({
            success: true,
            message: 'Payment successful',
            balance: wallet.balance
        });
    } catch (error) {
        console.error('Error verifying wallet payment:', error);
        res.status(500).json({ success: false, message: 'Error verifying payment', error: error.message });
    }
};



module.exports={
    loadWallet,
    verifyWallet,
    createWallet,
    
}