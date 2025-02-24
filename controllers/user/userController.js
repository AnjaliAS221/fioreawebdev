const User = require("../../models/userSchema");
const env = require("dotenv").config();
const session = require("express-session");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Banner = require("../../models/bannerSchema");
const Wallet = require("../../models/walletSchema")
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt")

const NODEMAILER_EMAIL = process.env.NODEMAILER_EMAIL
const NODEMAILER_PASSWORD  = process.env.NODEMAILER_PASSWORD

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: NODEMAILER_EMAIL,
        pass: NODEMAILER_PASSWORD
    },
    port: 465, 
  secure: true, 
  tls: {
    rejectUnauthorized: false 
  }
});

// load home page
const loadHomepage = async (req, res) => {
    try {

        const today = new Date().toISOString();
        const findBanner = await Banner.find({
            startDate:{$lt:new Date(today)},
            endDate:{$gt:new Date(today)},
        })

        const user = req.session.user; 
        const categories = await Category.find({ isListed: true }); 
        
        
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        });

        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        

        if (user) {
           
            userData = await User.findOne({ _id: user });
            return res.render("home",{user: userData,products:productData,banner:findBanner || []});
        }else{
            return res.render("home",{products:productData,banner:findBanner || []});
        }

    } catch (error) {
        console.error("Home page not loading", error);
        res.status(500).send("Server error");
    }
};

// error page
const pageNotFound = async(req,res)=>{
    try {
        return res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

// load signup
const loadSignup = async(req,res)=>{
    try {
        return res.render("signup")
    } catch (error) {
        console.log("home page not loading",error);
        res.status(500).send("Server error");
    }
}

// generates otp after signup
function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}


//verification of email by sending otp after signup
async function sendVerificationEmail(email, otp) {
        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        };

        return new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Email sending error:', error);
                    reject(error);
                } else {
                    console.log('Email sent successfully:', info.response);
                    resolve(info);
                }
            });
        });
    }


// user signup 
const signup = async (req, res) => {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;
   
    try {

        if (!name || !email || !password || !confirmPassword) {
            return res.render("signup", { message: "All required fields must be filled" });
        }

        if (password !== confirmPassword) {
            return res.render("signup", { message: "Passwords do not match" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render("signup", { message: "Invalid email format" });
        }

        const findUser = await User.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { phone: phone }
            ]
        });
        
        if (findUser) {
            return res.render("signup", { 
                message: findUser.email === email.toLowerCase() ? 
                    "User with this email already exists" : 
                    "User with this phone number already exists" 
            });
        }

        let referrer = null;
        if (referralCode) {
            referrer = await User.findOne({ 
                referralCode,
                status: 'active',
                isBlocked: false
            });
            
            if (!referrer) {
                return res.render("signup", { message: "Invalid or inactive referral code" });
            }
        }

        const otp = generateOtp();
        console.log("Generated OTP:", otp);

        try {
            await sendVerificationEmail(email, otp);

            req.session.userOtp = otp;
            req.session.userData = { 
                name, 
                phone, 
                email: email.toLowerCase(), 
                password,
                referralCode 
            };

            req.session.otpExpiry = Date.now() + (10 * 60 * 1000); 

            return res.render("verify-otp", { message: "OTP sent successfully. Please verify." });
        } catch (emailError) {
            console.error("Failed to send OTP email:", emailError);
            return res.render("signup", { message: "Failed to send OTP email. Please try again." });
        }

    } catch (error) {
        console.error("Error in signup:", error);
        res.status(500).render("error", { message: "An error occurred during signup" });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        
        if (!req.session.userOtp || !req.session.userData) {
            return res.status(400).json({
                success: false,
                message: "Session expired. Please signup again."
            });
        }

        if (Date.now() > req.session.otpExpiry) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one."
            });
        }

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            let referralCode;
            let isUnique = false;
            while (!isUnique) {
                referralCode = Math.random().toString(36).slice(2, 10).toUpperCase();
                const existingUser = await User.findOne({ referralCode });
                if (!existingUser) {
                    isUnique = true;
                }
            }

            const saveUserData = new User({
                name: user.name,
                phone: user.phone,
                email: user.email,
                password: passwordHash,
                status: 'active',
                referralCode,
                referredBy: user.referralCode || null,  
                redeemed: user.referralCode ? true : false
            });

            await saveUserData.save();

            const newUserBonus = user.referralCode ? 100 : 0; 
            const newUserWallet = new Wallet({
                userId: saveUserData._id,
                balance: newUserBonus,
                transactions: newUserBonus > 0 ? [{
                    type: "Sign Up Bonus",
                    amount: newUserBonus,
                    status: 'Completed',
                    description: "Signup bonus for using a referral code"
                }] : []
            });

            await newUserWallet.save();
            
            if (user.referralCode) {
                const referrer = await User.findOne({ 
                    referralCode: user.referralCode,
                    status: 'active',
                    isBlocked: false
                });

                if (referrer) {
                    const referralReward = 120;
                    
                    await Wallet.findOneAndUpdate(
                        { userId: referrer._id },
                        {
                            $inc: { balance: referralReward },
                            $push: {
                                transactions: {
                                    type: "Referral Bonus",
                                    amount: referralReward,
                                    status: 'Completed',
                                    description: `Bonus for referring user ${saveUserData.email}`
                                }
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
            }
    

            delete req.session.userOtp;
            delete req.session.userData;
            delete req.session.otpExpiry;

            req.session.user = saveUserData._id;
            
            res.json({ success: true, redirectUrl: "/" });
        } else {
            res.status(400).json({
                success: false,
                message: "Invalid OTP. Please try again."
            });
        }
    } catch (error) {
        console.error("Error Verifying OTP:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred during verification"
        });
    }
};


// resend otp
const resendOtp = async (req,res) => {
   try {
    if (!req.session.userData || !req.session.userData.email) {
        return res.status(400).json({ success: false, message: "Email not found in session" });
    }
    
    const { email } = req.session.userData;
    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email,otp);
    if(emailSent){
        console.log("Resend OTP:",otp);
        res.status(200).json({success:true,message:"OTP Resend Successfully"});
    }else{
        res.status(500).json({success:false,message:"Failed to resend OTP. please try again"});
    }

   } catch (error) {
    console.error("Error Resending OTP",error);
    res.status(500).json({success:false,message:"Internal Server Error. please try again"})
   }
}

// secure password
const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw error; 
    }
}

// load login page
const loadLogin = async (req,res)=>{
    try {
        if(!req.session.user){
            return res.render("login",{message:""})
        }else{
            res.redirect('/');
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

// user login
const login = async(req,res)=>{
    try {
        
        const {email,password} = req.body;
        const findUser = await User.findOne({isAdmin:false,email:email});


            if(!findUser){
                return res.render("login",{message:"User not Found"});
            }
            
            if(findUser.isBlocked){
                return res.render('login',{message:"User is blocked by Admin"});
            }

            const passwordMatch = await bcrypt.compare(password,findUser.password);

            if(!passwordMatch){
                return res.render("login",{message:"Incorrect password"});
            }
            req.session.user = findUser._id;
            res.redirect('/');

    } catch (error) {
        console.error("login error:",error);
        res.render("login",{message:"Login failed. Please try again later"});
    }
}

// user logout
const logout = async(req,res)=>{
    try {
        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error",err.message);
                return res.redirect("/pageNotFound");
            }
            return res.redirect("/login");
        })
    } catch (error) {
        console.log("Logout error",error);
        res.redirect("/pageNotFound");
    }
}








module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    
}