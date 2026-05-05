const r = require('express').Router();
const C = require('../controllers/controllers');
const { protect } = require('../middleware/authMiddleware');
r.put('/profile', protect, C.updateProfile);
r.get('/patient-profile', protect, C.getPatientProfile);
r.put('/patient-profile', protect, C.updatePatientProfile);
module.exports = r;
