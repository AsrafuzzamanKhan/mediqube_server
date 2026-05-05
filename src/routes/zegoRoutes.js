const r = require('express').Router();
const C = require('../controllers/controllers');
const { protect } = require('../middleware/authMiddleware');
r.post('/token', protect, C.getZegoToken);
module.exports = r;
