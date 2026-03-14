const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Validate and clean MongoDB URI
    let mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // Remove any invalid characters from database name in URI
    // MongoDB database names cannot contain: / \ . " $
    // Replace invalid characters with hyphens
    const uriParts = mongoUri.split('/');
    if (uriParts.length > 3) {
      // There's a database name specified
      const dbName = uriParts[uriParts.length - 1].split('?')[0]; // Remove query params
      const cleanDbName = dbName.replace(/[\/\\\.\"$]/g, '-');
      uriParts[uriParts.length - 1] = cleanDbName + (mongoUri.includes('?') ? mongoUri.split('?')[1] : '');
      mongoUri = uriParts.join('/');
    }

    const conn = await mongoose.connect(mongoUri, {
      // These options are recommended for Mongoose 6+
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.error('💡 Vérifiez que MONGODB_URI dans .env est correct');
    console.error('   Format attendu: mongodb://localhost:27017/nom-de-la-base');
    console.error('   Le nom de la base ne peut pas contenir: / \\ . " $');
    process.exit(1);
  }
};

module.exports = connectDB;

