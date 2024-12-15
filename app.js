const express = require("express");
const path = require("path");
const env = require("dotenv").config();
const session = require("express-session");
const flash = require('connect-flash');
const db = require("./config/db");
const passport = require("./config/passport");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");

db();
const app = express();

app.use(express.json());
app.use(express.urlencoded({extended :true}));
app.use(express.static(path.join(__dirname,"public")));

app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
     }
  }));

  app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
});

  app.use(flash());


app.use(passport.initialize());
app.use(passport.session());


// app.set('views', path.join(__dirname, 'views'));
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.set("view engine","ejs");


app.use("/",userRouter);

app.use('/admin',adminRouter);


app.listen(process.env.PORT, ()=>{
    console.log("Server is running");

})




app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    next();
});




module.exports = app;