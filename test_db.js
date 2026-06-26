const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to MongoDB");
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
    
    const salons = await db.collection('salons').find({}).toArray();
    console.log("Number of salons:", salons.length);
    if (salons.length > 0) {
      console.log("First salon:", JSON.stringify(salons[0], null, 2));
    }
    
    mongoose.disconnect();
  })
  .catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
  });
