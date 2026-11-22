const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    itemId: { type: String, unique: true, required: true },
    itemName: { type: String, required: true },
    category: { type: String, enum: ['Chicks', 'Feed', 'Medicine'], required: true },
    unit: { type: String, required: true } // e.g., KG, Pcs, Bottles
});

module.exports = mongoose.model('Item', ItemSchema);