const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { User } = require('../models');

const protect = asyncHandler(async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401); throw new Error('Not authorised — no token'); }
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user || !req.user.isActive) { res.status(401); throw new Error('Account not found or inactive'); }
    next();
  } catch { res.status(401); throw new Error('Token invalid or expired'); }
});

const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) { res.status(403); throw new Error('Access denied'); }
  next();
};

module.exports = { protect, allow };
