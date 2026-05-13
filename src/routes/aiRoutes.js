const r = require('express').Router();
const { chat, analysePrescription } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
r.post('/chat', protect, chat);
r.post('/analyse-prescription', protect, analysePrescription);
module.exports = r;
