const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    mobile: { type: String, required: true },
    company: { type: String, default: '' },
    notes: { type: String, default: '' },
    image: { type: String, default: '' },
    cloudinaryUrl: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' }
});

module.exports = mongoose.model('Request', requestSchema);
