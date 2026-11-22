const mongoose = require('mongoose');

const feedDispatchSchema = new mongoose.Schema({
    challanNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    feedType: { type: String, required: true },
    qtyKg: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['Pending', 'Approved', 'Rejected'], 
        default: 'Pending' 
    }
}, { timestamps: true });

module.exports = mongoose.model('FeedDispatch', feedDispatchSchema);