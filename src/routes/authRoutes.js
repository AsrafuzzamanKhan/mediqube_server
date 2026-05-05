const r = require('express').Router();
const C = require('../controllers/controllers');
const { protect } = require('../middleware/authMiddleware');
r.post('/register', C.register);
r.post('/login', C.login);
r.get('/me', protect, C.getMe);
r.put('/password', protect, C.updatePassword);
module.exports = r;
