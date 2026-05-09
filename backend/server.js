require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const Customer = require('./models/Customer');
const Request = require('./models/Request');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: [
        'http://localhost:5000',
        'http://localhost:3000',
        'http://127.0.0.1:5500', // Live Server
        /\.vercel\.app$/,        // any *.vercel.app domain
        /\.onrender\.com$/       // Render itself
    ],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Serve frontend static files (HTML, CSS, JS, assets)
app.use(express.static(path.join(__dirname, '..')));

// Connect to MongoDB with retry
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        console.log('Retrying in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};
connectDB();

// --- API ROUTES ---

// Get all customers (active and unclaimed)
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ timestamp: -1 });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single customer
app.get('/api/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findOne({ id: req.params.id });
        if (!customer) return res.status(404).json({ message: 'Customer not found' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create blank QR profile (Unclaimed)
app.post('/api/customers/blank', async (req, res) => {
    try {
        const { id } = req.body;
        const newCustomer = new Customer({
            id,
            status: 'unclaimed'
        });
        await newCustomer.save();
        res.status(201).json(newCustomer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new customer profile (or register from blank)
app.post('/api/customers', async (req, res) => {
    try {
        const { id, name, company, mobile, email, address, notes, image, cloudinaryUrl } = req.body;
        
        // If ID exists and status is unclaimed, update it to active
        let customer = await Customer.findOne({ id });
        if (customer) {
            customer.name = name;
            customer.company = company;
            customer.mobile = mobile;
            customer.email = email;
            customer.address = address;
            customer.notes = notes;
            customer.image = image;
            customer.cloudinaryUrl = cloudinaryUrl;
            customer.status = 'active';
            customer.timestamp = new Date();
            await customer.save();
            return res.json(customer);
        }

        // Otherwise create new active profile
        const newCustomer = new Customer({
            id, name, company, mobile, email, address, notes, image, cloudinaryUrl, status: 'active'
        });
        await newCustomer.save();
        res.status(201).json(newCustomer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update existing customer profile
app.put('/api/customers/:id', async (req, res) => {
    try {
        const updated = await Customer.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true }
        );
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete customer profile
app.delete('/api/customers/:id', async (req, res) => {
    try {
        await Customer.findOneAndDelete({ id: req.params.id });
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- REQUESTS ROUTES ---

// Get pending requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find({ status: 'pending' }).sort({ timestamp: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new request
app.post('/api/requests', async (req, res) => {
    try {
        const newReq = new Request(req.body);
        await newReq.save();
        res.status(201).json(newReq);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete (reject) request
app.delete('/api/requests/:id', async (req, res) => {
    try {
        await Request.findOneAndDelete({ id: req.params.id });
        res.json({ message: 'Request rejected/deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
