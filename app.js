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
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.url.endsWith('.js')) {
    res.type('application/javascript');
  } else if (req.url.endsWith('.css')) {
    res.type('text/css');
  } else if (req.url.endsWith('.png')) {
    res.type('image/png');
  }
  next();
});


app.use(express.static(path.join(__dirname, "public")));
app.use('/user-assets', express.static(path.join(__dirname, "user-assets")));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 72 * 60 * 60 * 1000
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


app.use(passport.initialize());
app.use(passport.session());

app.set("views", [
  path.join(__dirname, 'views/user'),
  path.join(__dirname, 'views/admin')
]);
app.set("view engine", "ejs");

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});



app.use('/admin', adminRouter);
app.use("/", userRouter);

app.use((req,res)=>{
  res.render("page-404")
})

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

module.exports = app;