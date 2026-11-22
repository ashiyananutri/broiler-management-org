require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes Import
const masterRoutes = require('./routes/master');
const entryRoutes = require('./routes/entry');
const reportRoutes = require('./routes/report');
const saleRoutes = require('./routes/sale');

// Optional Auth Route (agar routes/auth.js मौजूद ho toh mount karega)
try {
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
} catch (err) {
    console.log('Optional route ./routes/auth not found, skipping...');
}

// Optional Feed Transfer Route (agar routes/feedTransfer.js मौजूद ho toh mount karega)
try {
    const feedTransferRoutes = require('./routes/feedTransfer');
    app.use('/api/feed-transfer', feedTransferRoutes);
} catch (err) {
    console.log('Optional route ./routes/feedTransfer not found, skipping...');
}

// Mount API Routes
app.use('/api/master', masterRoutes);
app.use('/api/entry', entryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sale', saleRoutes);

// SPA Fallback (Express 4 & Express 5 safe)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// MongoDB Connection & Server Start
const PORT = process.env.PORT || 5000;
const MONGO_URI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URL ||
    'mongodb+srv://ashiyanafeedtraders1_db_user:rishu123456@cluster0.qk1qbgl.mongodb.net/broiler_db?retryWrites=true&w=majority&compressors=zlib';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('MongoDB connected successfully');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    });
