const mongoose = require('mongoose');
module.exports = async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mediqube');
  console.log(`✅ MongoDB: ${conn.connection.host}`);
};
