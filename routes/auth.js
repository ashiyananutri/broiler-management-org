const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Login Route
router.post('/login', async (req, res) => {
    try {
        const { userId, password } = req.body;
        
        // User find karein
        const user = await User.findOne({ userId }).populate('branch');
        if (!user) {
            return res.status(401).json({ error: 'Invalid User ID or Password' });
        }

        // Password check (Plain text ya bcrypt - yahan simple match rakha hai)
        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid User ID or Password' });
        }

        res.json({
            message: 'Login successful',
            user: {
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

module.exports = router;