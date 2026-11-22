const mongoose = require('mongoose');

const BranchSchema = new mongoose.Schema({
    branchId: { type: String, unique: true, required: true },
    branchName: { type: String, required: true },
    address: { type: String, required: true }
});

module.exports = mongoose.model('Branch', BranchSchema);