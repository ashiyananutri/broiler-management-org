const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Atlas Connection
const MONGO_URI = 'mongodb+srv://ashiyanafeedtraders1_db_user:rishu123456@cluster0.qk1qbgl.mongodb.net/broiler_db?retryWrites=true&w=majority&compressors=zlib';

mongoose.connect(MONGO_URI)
.then(() => console.log('MongoDB Atlas Connected Successfully!'))
.catch(err => console.error('Database connection error:', err));

// API Routes Registration
app.use('/api/auth', require('./routes/auth'));
app.use('/api/master', require('./routes/master'));
app.use('/api/entry', require('./routes/entry'));
// Server.js me routes register karne wale section me yeh line jodd dein:
app.use('/api/reports', require('./routes/report'));
// Serve Index HTML on root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});