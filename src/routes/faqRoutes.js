const r = require('express').Router();
const C = require('../controllers/controllers');
const { protect, allow } = require('../middleware/authMiddleware');
r.get('/',           C.getFAQs);
r.get('/categories', C.getFAQCategories);
r.post('/',          protect, allow('admin'), C.createFAQ);
r.put('/:id',        protect, allow('admin'), C.updateFAQ);
r.delete('/:id',     protect, allow('admin'), C.deleteFAQ);
module.exports = r;
