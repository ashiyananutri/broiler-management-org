const mongoose = require('mongoose');

const ChicksPlacementSchema = new mongoose.Schema({
    placementId: { type: String, unique: true, required: true },
    date: { type: Date, required: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chicksQty: { type: Number, required: true }
});

module.exports = mongoose.model('ChicksPlacement', ChicksPlacementSchema);