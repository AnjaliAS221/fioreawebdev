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

// email validation when change password
const changePasswordValid = async(req,res)=>{
    try {
        const {email} = req.body;

        const userExists = await User.findOne({email});
        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-password-otp");
                console.log("OTP:",otp);
            }else{
                res.json({
                    success: false,
                    message: "Failed to send OTP. Please try again"
                })
            }
        }else{
            res.render("change-password",{
                message: "User with this email does not exist"
            })
        }
    } catch (error) {
        console.log("Error in change password validation",error);
        res.redirect("/pageNotFound");
    }
}


const verifyChangePassOtp = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            res.json({success:true,redirectUrl: "/reset-password"});
        }else{
            res.json({success:false,message: "OTP does not match"});
        }
    } catch (error) {
        res.status(500).json({success:false, message: "An error occured. Please try again later"});
    }
}


// user address management
const addAddress = async(req,res)=>{
   try {
    const user = req.session.user;
    res.render("add-address",{user:user});
   } catch (error) {
    res.redirect("/pageNotFound");
   } 
}

// user post address
const postAddAddress = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});
        const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;
        
        const userAddress = await Address.findOne({userId : userData._id});
        if(!userAddress){
            const newAddress = new Address({
                userId: userData._id,
                address: [{addressType,name,city,landMark,state,pincode,phone,altPhone}]
            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone});
            await userAddress.save();
        }
        res.redirect("/userProfile");
    } catch (error) {
        console.error("Error adding address:",error);
        res.redirect("/pageNotFound");
    }
}

//user edit address
const editAddress = async(req,res)=>{
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id" : addressId,
        });
        if(!currAddress){
            return res.redirect("/pageNotFound");
        }

        const addressData = currAddress.address.find((item)=>{
            return item._id.toString() === addressId.toString();
        })

        if(!addressData){
            return res.redirect("/pageNotFound");
        }

        res.render("edit-address",{address : addressData, user : user});

    } catch (error) {
        console.error("Error in edit address:",error);
        res.redirect("/pageNotFound");
    }
}

//post edited address
const postEditAddress = async(req,res)=>{
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        const findAsddress = await Address.findOne({"address._id":addressId});
        if(!findAsddress){
            res.redirect("/pageNotFound");
        }
        await Address.updateOne(
            {"address._id": addressId},
            {$set : {
                "address.$" : {
                    _id : addressId,
                    addressType : data.addressType,
                    name: data.name,
                    city: data.city,
                    landMark: data.landMark,
                    state : data.state,
                    pincode: data.pincode,
                    phone : data.phone,
                    altPhone : data.altPhone
                }
            }}
        )

        res.redirect("/userProfile");
    } catch (error) {
        
        console.error("Error in edit address",error);
        res.redirect("/pageNotFound");
    }
}

//delete address
const deleteAddress = async(req,res)=>{
    try {
        
        const addressId = req.query.id;
    const findAddress = await Address.findOne({"address._id":addressId});

    if(!findAddress){
        return res.status(404).send("Address not found");
    }
    await Address.updateOne({
        "address._id":addressId
    },{
        $pull : {
            address: {
                _id : addressId,
            }
        }
    }
  )

    res.redirect("/userProfile");

    } catch (error) {
        console.error("Error in delete address",error);
        res.redirect("/pageNotFound");
    }
    
}


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
    changePasswordValid,
    verifyChangePassOtp,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress
}