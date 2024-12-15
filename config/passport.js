const passport = require("passport");
const googleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
require("dotenv").config();

passport.use(new googleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3006/auth/google/callback',
    scope: ['profile', 'email']
}, 
(accessToken, refreshToken, profile, done) => {
    const displayName = profile.displayName || 'No Name';
    const email = profile.emails?.[0]?.value || 'No Email';

    User.findOne({ googleId: profile.id })
        .then(existingUser => {
            if (existingUser) {
                // User already exists, pass the existing user
                return done(null, existingUser);
            } else {
                // Create new user
                const newUser = new User({
                    name: displayName,
                    email: email,
                    googleId: profile.id
                });

                newUser.save()
                    .then(user => done(null, user))
                    .catch(error => done(error, null));
            }
        })
        .catch(error => done(error, null));
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => done(null, user))
        .catch(err => done(err, null));
});

module.exports = passport;