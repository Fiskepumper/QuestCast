const passport         = require('passport');
const GoogleStrategy   = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { findOrCreate, getUser } = require('./users');
const { addRegistration }       = require('../challenges/_registrations');

passport.serializeUser((user, done) => done(null, user.uuid));
passport.deserializeUser(async (uuid, done) => {
  try {
    const user = await getUser(uuid);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Google
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  `${BASE_URL}/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const { user, isNew } = await findOrCreate({
        platform:   'google',
        platformId: profile.id,
        username:   profile.displayName,
        email:      profile.emails?.[0]?.value,
        avatarUrl:  profile.photos?.[0]?.value,
      });
      if (isNew) await addRegistration('google');
      done(null, user);
    } catch (err) { done(err); }
  }));
}

// Facebook (also covers Instagram via Meta login)
if (process.env.FACEBOOK_APP_ID) {
  passport.use(new FacebookStrategy({
    clientID:      process.env.FACEBOOK_APP_ID,
    clientSecret:  process.env.FACEBOOK_APP_SECRET,
    callbackURL:   `${BASE_URL}/auth/facebook/callback`,
    profileFields: ['id', 'displayName', 'emails', 'photos'],
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const { user, isNew } = await findOrCreate({
        platform:   'facebook',
        platformId: profile.id,
        username:   profile.displayName,
        email:      profile.emails?.[0]?.value,
        avatarUrl:  profile.photos?.[0]?.value,
      });
      if (isNew) await addRegistration('facebook');
      done(null, user);
    } catch (err) { done(err); }
  }));
}

// Microsoft
if (process.env.MICROSOFT_CLIENT_ID) {
  passport.use(new MicrosoftStrategy({
    clientID:     process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL:  `${BASE_URL}/auth/microsoft/callback`,
    scope:        ['openid', 'profile', 'email', 'User.Read'],
    tenant:       'common',
    graphApiVersion: 'v1.0',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const { user, isNew } = await findOrCreate({
        platform:   'microsoft',
        platformId: profile.id || profile._json?.id || profile._json?.sub,
        username:   profile.displayName || profile._json?.displayName || profile._json?.name || 'Microsoft User',
        email:      profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName,
        avatarUrl:  null,
      });
      if (isNew) await addRegistration('microsoft');
      done(null, user);
    } catch (err) { done(err); }
  }));
}

module.exports = passport;
