const path = require('path');
const cors = require('cors');
const connectDB = require('./config/database');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/error');
const { protect } = require('./middleware/auth');

// Load environment variables from .env file
dotenv.config();

// Valider la clé JWT_SECRET au démarrage
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: La variable d\'environnement JWT_SECRET doit être définie.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('❌ FATAL: En production, JWT_SECRET doit faire au moins 32 caractères pour être sécurisée.');
  process.exit(1);
} else if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️ AVERTISSEMENT: La clé JWT_SECRET est faible (< 32 caractères). Veuillez la renforcer en production.');
}

// Connect to MongoDB
connectDB();
const express = require('express');
const app = express();
app.set('trust proxy', 1); // Indispensable pour express-rate-limit derrière un reverse proxy ou un tunnel

app.use(helmet());

// Limiteur global pour empêcher les attaques DDoS
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requêtes maximum par minute par IP
  message: { success: false, message: 'Trop de requêtes. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://app.westdigitalhub.com',
  'https://beautyflow.westdigitalhub.com',
  'http://localhost:5173',
  'http://localhost:8080'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Non autorisé par CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/AuthRouter'));
app.use('/api/marketplace', require('./routes/MarketplaceRouter'));
app.post('/api/salons/onboard', protect, require('./controllers/SalonController').onboardSalon);
app.post('/api/salons/link', protect, require('./controllers/SalonController').linkSalon);
app.use('/api/salons/:salonId', require('./routes/salonRouter'));
app.use('/api/admin', require('./routes/AdminRouter'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/notifications', require('./routes/notificationRouter'));

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
