const mongoose = require('mongoose');

const FarmerSchema = new mongoose.Schema({
    farmerId: { type: String, unique: true, required: true },
    farmerName: { type: String, required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    mobileNo: { type: String, required: true },
    address: { type: String, required: true },
    bankDetails: {
        bankName: String,
        accountNo: String,
        ifsc: String,
        branchName: String
    }
});

module.exports = mongoose.model('Farmer', FarmerSchema);