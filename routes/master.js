const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');
const User = require('../models/User');
const Farmer = require('../models/Farmer');
const Trader = require('../models/Trader');
const Item = require('../models/Item');

// --- BRANCH ROUTES ---
router.post('/branch', async (req, res) => {
    try {
        const branch = new Branch(req.body);
        await branch.save();
        res.status(201).json({ message: 'Branch created successfully', branch });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/branch', async (req, res) => {
    try { res.json(await Branch.find()); } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/branch/:id', async (req, res) => {
    try {
        const updated = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Branch updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/branch/:id', async (req, res) => {
    try {
        await Branch.findByIdAndDelete(req.params.id);
        res.json({ message: 'Branch deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- USER ROUTES ---
router.post('/user', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json({ message: 'User created successfully', user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/user', async (req, res) => {
    try { res.json(await User.find().populate('branch')); } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/user/:id', async (req, res) => {
    try {
        const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'User updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/user/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FARMER ROUTES ---
router.post('/farmer', async (req, res) => {
    try {
        const farmer = new Farmer(req.body);
        await farmer.save();
        res.status(201).json({ message: 'Farmer created successfully', farmer });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/farmer', async (req, res) => {
    try {
        const farmers = await Farmer.find().populate('supervisor').populate('branch');
        res.json(farmers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/farmer/:id', async (req, res) => {
    try {
        const updated = await Farmer.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Farmer updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/farmer/:id', async (req, res) => {
    try {
        await Farmer.findByIdAndDelete(req.params.id);
        res.json({ message: 'Farmer deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- TRADER ROUTES ---
router.post('/trader', async (req, res) => {
    try {
        const trader = new Trader(req.body);
        await trader.save();
        res.status(201).json({ message: 'Trader created successfully', trader });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/trader', async (req, res) => {
    try { res.json(await Trader.find()); } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/trader/:id', async (req, res) => {
    try {
        const updated = await Trader.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Trader updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/trader/:id', async (req, res) => {
    try {
        await Trader.findByIdAndDelete(req.params.id);
        res.json({ message: 'Trader deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ITEM ROUTES ---
router.post('/item', async (req, res) => {
    try {
        const item = new Item(req.body);
        await item.save();
        res.status(201).json({ message: 'Item created successfully', item });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/item', async (req, res) => {
    try { res.json(await Item.find()); } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/item/:id', async (req, res) => {
    try {
        const updated = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Item updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/item/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: 'Item deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;