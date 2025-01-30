const User = require("../../models/userSchema");
const env = require("dotenv").config();
const session = require("express-session");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Banner = require("../../models/bannerSchema");
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
    const { name, phone, email, password, confirmPassword } = req.body;
   
    try {
        console.log("Signup function started");

        if (password !== confirmPassword) {
            return res.render("signup", { message: "Passwords do not match" });
        }

        const findUser = await User.findOne({ email });
        
        if (findUser) {
            return res.render("signup", { message: "User with this email already exists" });
        }

        const otp = generateOtp();
        console.log("Generated OTP:", otp);

        try {
            await sendVerificationEmail(email, otp);
            
            req.session.userOtp = otp;
            req.session.userData = { name, phone, email, password };
            console.log("OTP sent successfully:", otp);

            return res.render("verify-otp", { message: "OTP sent successfully. Please verify." });
        } catch (emailError) {
            console.error("Failed to send OTP email:", emailError);
            return res.render("signup", { message: "Failed to send OTP email" });
        }

    } catch (error) {
        console.error("Error in signup:", error);
        res.redirect("/pageNotFound");
    }
};



// otp verification
const verifyOtp = async (req,res) =>{
    try {
        
        const {otp} = req.body;

        console.log(otp)

        const storedOtp = req.session.userOtp;

        if(otp===storedOtp){
            const user = req.session.userData
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name:user.name,
                phone: user.phone,
                email:user.email,
                password:passwordHash
            })

            await saveUserData.save();
            req.session.user = saveUserData._id;
            res.json({success:true,redirectUrl:"/"})
        }else{
            res.status(400).json({success:false,message:"Invalid OTP, Please try again"})
        }
    } catch (error) {
        console.error("Error Verifying OTP",error);
        res.status(500).json({success:false,message:"An error occured"})
    }
}

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
        throw error; // Re-throw to allow caller to handle
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



//load shopping page

const loadShoppingPage = async (req, res) => {
    try {
        
        const allCategories = await Category.find();  
 
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });

        
        const listedCategories = await Category.find({ isListed: true });
        const categoryIds = listedCategories.map((category) => category._id.toString());

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        }).sort({ createdOn: -1 }).skip(skip).limit(limit);

        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        });

        const totalPages = Math.ceil(totalProducts / limit);

        const categoriesWithIds = listedCategories.map(category => ({ _id: category._id, name: category.name }));

       
        
        res.render("shop", {
            user: userData,
            products: products,
            categories: allCategories,
            category: categoriesWithIds,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
        });
    } catch (error) {
        console.log("shopping page not loading:", error);
        res.redirect("/pageNotFound");
    }
};


const searchProducts = async(req,res)=>{
    try {
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        let search = req.body.query.trim();

        
        const categories = await Category.find({isListed:true}).lean();
        const categoryIds = categories.map(category => category._id.toString());
        let searchResult = [];
        if(req.session.filteredProducts && req.session.filteredProducts.length > 0){
            searchResult = req.session.filteredProducts.filter(product=>{
                return product.productName.toLowerCase().includes(search.toLowerCase());
            })
        }else{
            searchResult = await Product.find({
                productName : {$regex: ".*" + search + ".*", $options: "i"},
                isBlocked:false,
                quantity: {$gt:0},
                category: {$in : categoryIds}
            })
        }

        searchResult.sort((a,b)=> new Date(n.createdOn) - new Date(a.createdOn));
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length/itemsPerPage);
        const currentProduct = searchResult.slice(startIndex,endIndex);

        res.render("shop",{
            user: userData,
            products: currentProduct,
            categories: categories,
            totalPages,
            currentPage,
            count: searchResult.length,
        })

    } catch (error) {
        console.log(error);
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
    loadShoppingPage,
    searchProducts
}