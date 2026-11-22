const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');

// Login Route (Single Active Session)
router.post('/login', async (req, res) => {
    try {
        const { userId, password } = req.body;

        const user = await User.findOne({ userId: String(userId || '').trim() }).populate('branch');
        if (!user) {
            return res.status(401).json({ error: 'Invalid User ID or Password' });
        }

        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid User ID or Password' });
        }

        // Har naye login par naya sessionId -> purane system ka session invalid ho jayega
        const sessionId = crypto.randomUUID();
        user.activeSessionId = sessionId;
        user.lastActiveAt = new Date();
        await user.save();

        res.json({
            message: 'Login successful',
            sessionId,
            user: {
                _id: user._id,
                userId: user.userId,
                fullName: user.fullName,
                role: user.role,
                branch: user.branch,
                mobileNumber: user.mobileNumber
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Session Check Route (Watcher ke liye)
router.get('/check-session', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        const userId = req.headers['x-user-id'];

        if (!sessionId || !userId) {
            return res.status(401).json({ error: 'Session missing' });
        }

        const user = await User.findById(userId).select('activeSessionId lastActiveAt');
        if (!user || !user.activeSessionId || user.activeSessionId !== sessionId) {
            return res.status(401).json({
                error: 'Aapka account kisi dusre system par login ho gaya hai.'
            });
        }

        const idleMs = Date.now() - new Date(user.lastActiveAt || Date.now()).getTime();
        if (idleMs > 5 * 60 * 1000) {
            user.activeSessionId = null;
            await user.save();
            return res.status(401).json({
                error: '5 minute inactivity ke karan session expire ho gaya.'
            });
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Logout Route
router.post('/logout', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.body?.userId;
        if (userId) {
            await User.findByIdAndUpdate(userId, { activeSessionId: null });
        }
        res.json({ message: 'Logged out' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware: Protected API routes ke liye
async function verifySingleSession(req, res, next) {
    try {
        const sessionId = req.headers['x-session-id'];
        const userId = req.headers['x-user-id'];

        if (!sessionId || !userId) {
            return res.status(401).json({ error: 'Session missing. Kripya login karein.' });
        }

        const user = await User.findById(userId);
        if (!user || !user.activeSessionId || user.activeSessionId !== sessionId) {
            return res.status(401).json({
                error: 'Aapka account kisi dusre system par login ho gaya hai.'
            });
        }

        const idleMs = Date.now() - new Date(user.lastActiveAt || Date.now()).getTime();
        if (idleMs > 5 * 60 * 1000) {
            user.activeSessionId = null;
            await user.save();
            return res.status(401).json({
                error: '5 minute inactivity ke karan session expire ho gaya.'
            });
        }

        user.lastActiveAt = new Date();
        await user.save();
        req.currentUser = user;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = router;
module.exports.verifySingleSession = verifySingleSession;
