const path = require('path');
const cors = require('cors');
const connectDB = require('./config/database');
const dotenv = require('dotenv');
const helmet = require('helmet');
const errorHandler = require('./middleware/error');
const { protect } = require('./middleware/auth');

// Load environment variables from .env file
dotenv.config();
// Connect to MongoDB
connectDB();
const express = require('express');
const app = express();

app.use(helmet());
app.use(cors({

  origin: '*', //process.env.FRONTEND_URL || 'https://app.westdigitalhub.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}

));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/AuthRouter'));
app.use('/api/marketplace', require('./routes/MarketplaceRouter'));
app.post('/api/salons/onboard', protect, require('./controllers/SalonController').onboardSalon);
app.post('/api/salons/link', protect, require('./controllers/SalonController').linkSalon);
app.use('/api/salons/:salonId', require('./routes/salonRouter'));
app.use('/api/admin', require('./routes/AdminRouter'));
app.use('/api/payments', require('./routes/PaymentRouter'));
app.use('/api/upload', require('./routes/uploadRoutes'));

app.get('/payment-completed', protect, (req, res) => {
  if (req.query.status === 'successful') {
    return res.sendFile(path.join(process.cwd(), 'public', 'payment-completed.html'));
  }
  return res.sendFile(path.join(process.cwd(), 'public', 'payment-failed.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});

// // Route non trouvée
// app.use('*', (req, res) => {
//   res.status(404).json({ success: false, message: `Route ${req.originalUrl} introuvable` });
// });

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});
