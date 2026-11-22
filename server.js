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
const feedTransferRoutes = require('./routes/feedTransfer');

// Optional Auth Route
try {
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
} catch (err) {
    console.log('Optional route ./routes/auth not found, skipping...');
}

// Mount API Routes
app.use('/api/master', masterRoutes);
app.use('/api/entry', entryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sale', saleRoutes);
app.use('/api/feed-transfer', feedTransferRoutes);

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
    process.env.DB_URL;

if (!MONGO_URI) {
    console.error('Error: MONGO_URI / MONGODB_URI environment variable is not set!');
    process.exit(1);
}

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
