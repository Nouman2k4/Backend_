require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

// CORS configuration
const corsOptions = {
    origin: '*', // Allow all origins for development (update for production)
    credentials: true, // Allow credentials if needed
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.static('public')); // Serve static files from the 'public' directory

const port = process.env.PORT || 4000; // Use environment variable for port

// MongoDB connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
    .then(() => {
        console.log('MongoDB connected');
        prefetchHostelData(); // Prefetch hostel data after MongoDB connection is established
    })
    .catch(err => console.error('MongoDB connection error:', err));

// Define the hostel schema
const hostelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    images: { type: [String] }, // Array of image URLs
    location: { type: String, required: true }, // Single string for location
    description: { type: String },
    category: {
        type: String,
        enum: ['boys', 'girls', 'co-ed'], // Define allowed categories
        required: true
    },
    rating: {
        type: Number,
        min: 0,
        max: 5
    },
    rooms: [
        {
            type: String,
            price: Number
        }
    ]
}, { collection: 'hostels' });

const Hostel = mongoose.model('Hostel', hostelSchema);

// Cache to store hostel data
let hostelCache = [];

// Function to prefetch hostel data
async function prefetchHostelData() {
    try {
        hostelCache = await Hostel.find(); // Fetch all hostels and store in cache
        console.log('Hostel data pre-fetched and cached');
    } catch (error) {
        console.error('Error pre-fetching hostel data:', error);
    }
}

// Route for the home page
app.get('/', (req, res) => {
    res.send('Hello World');
});

// Route for about page
app.get('/about', (req, res) => {
    res.send('This is the About page');
});

// Route for fetching hostel info by name
app.get('/hostel/:name', (req, res) => {
    const hostelName = req.params.name;
    const hostel = hostelCache.find(h => h.name === hostelName);
    if (hostel) {
        res.json(hostel);
    } else {
        res.status(404).send('Hostel not found');
    }
});

// Route to get limited hostel data from cache
app.get('/hostel-data', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Get the page number from query parameter
    const limit = parseInt(req.query.limit) || 5; // Get the limit from query parameter
    const skip = (page - 1) * limit; // Calculate the number of documents to skip

    try {
        const totalHostels = await Hostel.countDocuments(); // Get total count of hostels
        const hostels = await Hostel.find().skip(skip).limit(limit); // Fetch limited hostels

        res.json({
            totalPages: Math.ceil(totalHostels / limit),
            currentPage: page,
            hostels
        });
    } catch (error) {
        console.error('Error fetching hostel data:', error);
        res.status(500).json({ message: 'Error fetching hostel data', error });
    }
});

// Route to filter hostels by category and rating
app.get('/hostels', async (req, res) => {
    const { category, rating } = req.query;

    try {
        let query = {};

        if (category) {
            query.category = category; // Use the provided category for filtering
            console.log(`Filtering by category: ${category}`);
        }

        let sort = {};

        if (rating) {
            if (rating === "low-to-high") {
                sort.rating = 1; // Ascending
                console.log('Sorting by rating: low-to-high');
            } else if (rating === "high-to-low") {
                sort.rating = -1; // Descending
                console.log('Sorting by rating: high-to-low');
            } else {
                const parsedRating = parseFloat(rating);
                if (!isNaN(parsedRating)) {
                    query.rating = { $gte: parsedRating }; // Filter ratings >= provided number
                    console.log(`Filtering by rating: ${parsedRating}`);
                } else {
                    console.warn(`Invalid rating value provided: ${rating}`);
                    return res.status(400).json({ message: 'Invalid rating value provided' });
                }
            }
        }

        console.log('Query:', query);
        const filteredHostels = await Hostel.find(query).sort(sort);
        console.log(`Found ${filteredHostels.length} hostels matching the query.`);
        res.json(filteredHostels);
    } catch (error) {
        console.error('Error fetching filtered hostel data:', error);
        res.status(500).json({ message: 'Error fetching filtered hostel data', error });
    }
});

// Route for search requests
app.post('/search', async (req, res) => {
    const { query } = req.body;

    try {
        const searchResults = await Hostel.find({
            $or: [
                { location: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } }
            ]
        });
        res.json(searchResults);
    } catch (error) {
        console.error('Error performing search:', error);
        res.status(500).json({ message: 'Error performing search', error });
    }
});

// Route to get a limited number of hostels from cache
app.get('/hostel-limit', (req, res) => {
    const limit = parseInt(req.query.limit) || 5;
    const limitedHostels = hostelCache.slice(0, limit);
    res.json(limitedHostels);
});

// Start the server
app.listen(port, () => {
    console.log(`App is running on http://localhost:${port}`);
});
