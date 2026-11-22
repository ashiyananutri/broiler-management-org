const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    fullName: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Manager', 'Accountant', 'Supervisor', 'Godown Incharge', 'Sales Manager', 'Lifter'], required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    mobileNumber: { type: String, required: true }
});

module.exports = mongoose.model('User', UserSchema);