const r = require('express').Router();
const C = require('../controllers/controllers');
const { protect } = require('../middleware/authMiddleware');
r.get('/',             protect, C.getNotifications);
r.put('/read-all',     protect, C.markAllRead);
r.put('/:id/read',     protect, C.markRead);
r.delete('/:id',       protect, C.deleteNotif);
module.exports = r;
