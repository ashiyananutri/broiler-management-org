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
const authRoutes = require('./routes/auth');
const masterRoutes = require('./routes/master');
const entryRoutes = require('./routes/entry');
const reportRoutes = require('./routes/report');
const saleRoutes = require('./routes/sale');

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/entry', entryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sale', saleRoutes);

// Fallback to index.html for frontend SPA / tabs
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// MongoDB Connection & Server Start
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

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
