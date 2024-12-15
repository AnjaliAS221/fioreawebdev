const User = require("../models/userSchema");


const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
        if(data && !data.isBlocked){
            next();
        }else{
            res.redirect("/login");
            return res.status(403).json({ message: 'User is blocked or session is invalid' });
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



// const authenticateUser = async (req, res, next) => {
//   try {
//     // Check for token in cookies or authorization header
//     const token = req.cookies.token || req.headers.authorization?.split(' ')[1];


//     if (!token) {
//       return res.status(401).json({ message: 'No token, authorization denied' });
//     }

//     console.log("Token received:", token);
//     // Verify token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
//     console.log("Decoded token:", decoded);

//     // Find user and attach to request
//     const user = await User.findById(decoded.userId).select('-password');
    
//     if (!user) {
//       return res.status(401).json({ message: 'User not found' });
//     }

//     req.user = user;
//     next();
//   } catch (error) {
//     console.error('Authentication error:', error);
//     res.status(401).json({ message: 'Token is not valid' });
//   }
// };

// // Additional middleware for role-based access
// exports.authorizeRoles = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({ 
//         message: 'You do not have permission to access this resource' 
//       });
//     }
//     next();
//   };
// };

module.exports = {
    userAuth,
    adminAuth,
    // authenticateUser,
}