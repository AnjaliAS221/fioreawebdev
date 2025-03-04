const User = require("../models/userSchema");

const userAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(401).json({ message: "Unauthorized: Please log in first." });
    }
    return res.redirect("/login");
  }else{
    User.findById(req.session.user)
    .then((data) => {
      if (!data) {
        req.session.destroy((err) => {
          if (err) {
            console.log("Error destroying session:", err);
            return res.status(500).send("Internal server error");
          }
          return res.redirect("/login");
        });
      } else if (data.isBlocked) {
        
        req.session.destroy((err) => {
          if (err) {
            console.log("Error destroying session:", err);
            return res.status(500).send("Internal server error");
          }
          return res.status(403).render("login", {
            message: "Your account has been blocked. Please contact support.",
          });
        });
      } else {
        req.user = data;
        next();
      }
    })
    .catch((error) => {
      console.log("Error in user auth middleware:", error);
      return res.status(500).send("Internal server error");
    });
  }

  
};

const adminAuth = (req, res, next) => {
  if (!req.session || !req.session.admin) {
    return res.redirect("/admin/login");
  }

  User.findOne({ isAdmin: true })
    .then((data) => {
      if (data) {
        next();
      } else {
        res.redirect("/admin/login");
      }
    })
    .catch((error) => {
      console.log("Error in admin auth", error);
      res.status(500).send("Internal server error");
    });
};

module.exports = {
  userAuth,
  adminAuth,
};