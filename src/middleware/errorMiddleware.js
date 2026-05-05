const notFound = (req, res, next) => { res.status(404); next(new Error(`Not Found — ${req.originalUrl}`)); };

const errorHandler = (err, req, res, next) => {
  let status  = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;
  if (err.name === 'CastError')       { status = 404; message = 'Resource not found'; }
  if (err.code  === 11000)            { status = 400; message = `${Object.keys(err.keyValue)[0]} already exists`; }
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map(e => e.message).join(', '); }
  res.status(status).json({ success: false, message });
};

module.exports = { notFound, errorHandler };
