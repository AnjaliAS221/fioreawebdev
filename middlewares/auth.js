const User = require("../models/userSchema");


const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
        if(data && !data.isBlocked){
            req.user = data;
            next();
        }else{
            req.session.destroy(() => {
                return res.status(403).render("login", { message: "Your account has been blocked. Please contact support." });
            });
        }

        })
        .catch(error=>{
            console.log("Error in user auth middleware:",error);
            res.status(500).send("Internal server error");
        })
    }else{
        res.redirect("/login");
    }
}


const adminAuth = (req,res,next)=>{
    if(req.session.admin){
        User.findOne({isAdmin:true})
        .then(data=>{
            if(data){
                next()
            }else{
                res.redirect('/admin/login')
            }
        })
        .catch(error=>{
            console.log("Error in admin auth",error);
            res.status(500).send("Internal server error")
        })
    }else{
        res.redirect('/admin/login')
    }
}



  
module.exports = {
    userAuth,
    adminAuth,
    
}