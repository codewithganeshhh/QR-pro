const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    company: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    notes: { type: String, default: '' },
    cloudinaryUrl: { type: String, default: '' },
    image: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, default: 'active' } // 'active' or 'unclaimed'
});

module.exports = mongoose.model('Customer', customerSchema);
