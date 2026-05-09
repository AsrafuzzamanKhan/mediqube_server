// const mongoose = require('mongoose');
// module.exports = async () => {
//   const conn = await mongoose.connect(process.env.MONGODB_URI);
//   console.log(` MongoDB: ${conn.connection.host} ${process.env.MONGODB_URI}`);
//   console.log("Pinged your deployment. You successfully connected to MongoDB!");
// };
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;