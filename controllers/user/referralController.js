const User = require('../../models/userSchema');
const Referral = require('../../models/referralSchema'); 


const loadDashboard = async (req, res) => {
    try {
        const userId = req.session.user;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }

        const data = {
            user: user,
            referralLink: `${process.env.SITE_URL || 'http://localhost:3006'}/signup?ref=${user._id}`,
            earnedAmount: 0,
            referralCount: 0,
            userAddress: null,
            orders: null
        };
    
       

        try {
            const referralStats = await Referral.aggregate([
                { $match: { referrerId: userId } },
                {
                    $group: {
                        _id: null,
                        totalEarned: { $sum: "$earnedAmount" },
                        count: { $sum: 1 }
                    }
                }
            ]);

            if (referralStats.length > 0) {
                data.earnedAmount = referralStats[0].totalEarned;
                data.referralCount = referralStats[0].count;
            }
        } catch (error) {
            console.error('Error fetching referral stats:', error);
        }

        res.render('user/profile', data);
    } catch (error) {
        console.error('Error in loadDashboard:', error);
        res.status(500).render('error', { 
            message: 'Error loading profile page'
        });
    }
};
        
      
module.exports = {
    loadDashboard
}