

const r = require('express').Router();
const C = require('../controllers/controllers');
const { protect } = require('../middleware/authMiddleware');

r.post('/register', C.register);
r.post('/login', C.login);
r.post('/forgot-password', C.forgotPassword);
r.post('/reset-password/:token', C.resetPassword);
r.get('/verify-email/:token', C.verifyEmail);

r.get('/me', protect, C.getMe);
r.put('/password', protect, C.updatePassword);

module.exports = r;