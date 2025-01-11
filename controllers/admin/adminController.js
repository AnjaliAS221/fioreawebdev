const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


// load login page
const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin/dashboard");
    }
    res.render("admin-login",{message:null})
}

// admin login
const login = async(req,res)=>{
    try {
        
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});

        if(admin){
            const passwordMatch = bcrypt.compare(password,admin.password);
            if(passwordMatch){
                req.session.admin = true;
                return res.redirect("/admin");
            }else{
                return res.redirect("/login");
            }
        }else{
            return res.redirect("/login");
        }
    } catch (error) {
        console.log("login error",error);
        return res.redirect("/admin/pageerror");
    }
}


// error  page
const pageerror = async(req,res)=>{
    res.render("admin-error");
}

// admin logout
const logout = async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session",err);
                return res.redirect("/admin/pageerror")
            }
            res.redirect("/admin/login");
        })
    } catch (error) {
        res.redirect("/admin/login");
    }
}



module.exports = {
    loadLogin,
    login,
    pageerror,
    logout,
}