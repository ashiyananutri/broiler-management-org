const mongoose = require('mongoose');

const liftingRowSchema = new mongoose.Schema({
    slNo: { type: Number, required: true },
    noOfBirds: { type: Number, default: 0 },
    weightKg: { type: Number, default: 0 }
}, { _id: false });

const saleEntrySchema = new mongoose.Schema({
    slNo: { type: String, required: true },
    date: { type: Date, required: true },
    liftingSupervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    liftingSupervisorName: { type: String, default: '' },
    trader: { type: mongoose.Schema.Types.ObjectId, ref: 'Trader' },
    partyName: { type: String, required: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
    farmerName: { type: String, required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    branchName: { type: String, default: '' },
    wtStartingTime: { type: String, default: '' },
    wtClosingTime: { type: String, default: '' },
    driverName: { type: String, default: '' },
    vehicleNo: { type: String, default: '' },
    rate: { type: Number, default: 0 },
    age: { type: Number, default: 0 },
    lsName: { type: String, default: '' },
    rows: [liftingRowSchema],
    totalPcs: { type: Number, default: 0 },
    totalWeightKg: { type: Number, default: 0 },
    avgBodyWeightKg: { type: Number, default: 0 },
    feedClosingStock: { type: String, default: '' },
    birdStock: { type: String, default: '' },
    weakBirds: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('SaleEntry', saleEntrySchema);
