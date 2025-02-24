const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Order = require('../../models/orderSchema')
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session");

//generating otp
function generateOtp(){
    const digits = "1234567890";
    let otp = "";
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)];
    }
    return otp;
}


//email verification
const sendVerificationEmail = async(email,otp)=>{
    try {
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            },
            tls: {
                rejectUnauthorized: false, 
            },
        })

        const mailOptions = {
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your OTP for password reset",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP: ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:",info.messageId);
        return true;

    } catch (error) {
        console.error("Error sending email",error);
        return false;
    }
}


const securePassword = async(password)=>{
    try {
        const passwordHash = await bcrypt.hash(password,10);
    return passwordHash;

    }catch (error){
        console.error("Error hashing password:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message })
    }
}

// forgot password
const getForgotPassPage = async (req, res) => {
    try {
   
        res.render('forgot-password', {
            title: 'Forgot Password',
            message: 'Enter your email to reset your password.',
        });
    } catch (error) {
        
        console.error('Error loading the Forgot Password page:', error);
        res.redirect("/pageNotFound");
    }
};

// forgot password email verification
const forgotEmailValid = async(req,res)=>{
    try {
        const {email} = req.body;
        const findUser = await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("forgotPassword-otp");
                console.log("OTP:",otp);
            }else{
                res.json({succes:false,message:"Failed to send OTP. Please try again later"});
            }
        }else{
            res.render("forgot-password",{
                message:"User with this email does not exist"
            });
            
        }
    } catch (error) {
        
    }
}

//verifying otp
const verifyForgotPassOtp = async (req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if (!req.session.userOtp) {
            return res.json({ success: false, message: "Session expired. Please retry." });
        }
        if(enteredOtp === req.session.userOtp){
            res.json({success:true,redirectUrl: "/reset-password"});
        }else{
            res.json({success:false,message: "OTP does not match. Please try again."});
        }
    } catch (error) {
        res.status(500).json({success:false,message: "An error occured. Please try again"});
    }
}


//reset password
const getResetPassPage = async(req,res)=>{
    try {
        res.render("reset-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
}


//resend OTP
const resendOtp = async(req,res)=>{
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log("Resending OTP to email:",email);
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true,message: "Resend OTP Successsfull"});
        }
    } catch (error) {
        console.error("Error in resend OTP:",error);
        res.status(500).json({success:false,message: "Internal server error"});
    }
}

// user profile 
const userProfile = async (req,res)=>{
    try {
        const userId = req.session.user;
        console.log(userId);
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId : userId});
        const orders = await Order.find({user:userId})
        console.log(orders);
        res.render('profile',{
            user:userData,
            userAddress : addressData,
            orders
        })
    } catch (error) {
        console.error("Error for retrieve profile data",error);
        res.redirect("/pageNotFound");
    }
}


const updateProfile = async (req, res) => {
    try {
      const { username, phone } = req.body;
      
      
      const user = await User.findByIdAndUpdate(req.user._id, { name: username, phone: phone }, { new: true });
      
      res.redirect('/userProfile');
    } catch (error) {
      console.error(error);
      res.status(500).send("Error updating profile");
    }
  };

//resetting password
const postNewPassword = async(req,res)=>{
    try {
        const {newPass1,newPass2} = req.body;
        const email = req.session.email;
        if(newPass1 === newPass2){
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                {email: email},
                {$set:{password:passwordHash}}
            )
            res.redirect("/login");
        }else{
            res.render("reset-password",{message: 'Passwords does not match'});
        }
    } catch (error) {
        res.redirect("/pageNotFound");
        }
}

//user email change
const changeEmail = async(req,res)=>{
    try {
        res.render("change-email");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
}

//user email changing validation
const changeEmailValid = async(req,res)=>{
    try{
        const {email} = req.body;

        const userExists = await User.findOne({email});
        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email;
                res.render("change-email-otp");
                console.log("Email sent:", email);
                console.log("OTP",otp);
            }else{
                res.json("email-error");
            }
        }else{
            res.render("change-email",{
                message: "User with this email not exist"
            });
        }
    }catch (error){
        res.render("/pageNotFound");
    }
}

// verifying email with otp
const verifyEmailOtp = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            req.session.userData = req.body.userData;
            res.render("new-email",{
                userData: req.session.userData,
            })
        }else{
            res.render("change-email-otp",{
                message: "OTP not matching",
                userData: req.session.userData
            });
            
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
}

// email updation
const updateEmail = async(req,res)=>{
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        res.redirect("/userProfile");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
}


//user password change
const changePassword = async(req,res)=>{
    try {
        res.render("change-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
}

//changing current password
const changeCurrentPassword = async (req, res) => {
    try {
        const userId = req.session.user; 
        const { currentPassword, newPassword, confirmPassword } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(400).render("change-password", { message: "User not found." });
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(400).render("change-password", { message: "Current password is incorrect." });
        }

        if (currentPassword === newPassword) {
            return res.status(400).render("change-password", { message: "New password must be different from the current password." });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).render("change-password", { message: "Passwords do not match." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(userId, { password: hashedPassword });

        res.redirect("/userProfile?success=Password updated successfully");

    } catch (error) {
        console.error("Error changing password:", error);
        res.render("change-password", { message: "Something went wrong. Please try again." });
    }
};




module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    userProfile,
    updateProfile,
    postNewPassword,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    changeCurrentPassword,
}