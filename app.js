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
mongoose.connect(mongoURI, { connectTimeoutMS: 30000 }) // 30 seconds timeout
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err.message));

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

// Cache to store hostel data with a Map for fast lookups by name
let hostelCache = new Map();

async function prefetchHostelData() {
    try {
        let page = 0;
        let limit = 10;
        let hostels;

        hostelCache = new Map(); // Initialize the cache
        hostelList = []; // Initialize the list to store all hostels

        // Fetch hostels in batches of 10
        do {
            page += 1; // Increment page number for the next batch
            hostels = await Hostel.find().skip((page - 1) * limit).limit(limit);

            // If hostels were found, add them to the list and cache
            if (hostels.length > 0) {
                hostelList.push(...hostels); // Add new hostels to the list
                hostels.forEach(hostel => {
                    hostelCache.set(hostel.name, hostel); // Cache by name
                });
            }
        } while (hostels.length === limit); // Continue until fewer than limit hostels are returned

        console.log('Hostel data pre-fetched and cached');
    } catch (error) {
        console.error('Error pre-fetching hostel data:', error);
    }
}


prefetchHostelData();

// Route for the home page
app.get('/', (req, res) => {
    res.send('Hello World');
});

// Route for fetching hostel info by name
app.get('/hostel/:name', (req, res) => {
    const hostelName = req.params.name;
    const hostel = hostelCache.get(hostelName);
    if (hostel) {
        res.json(hostel);
    } else {
        res.status(404).send('Hostel not found');
    }
});

// Route to get limited hostel data from cache with pagination
app.get('/hostel-data', (req, res) => {
    const page = parseInt(req.query.page) || 1; // Get the page number from query parameter
    const limit = parseInt(req.query.limit) || 5; // Get the limit from query parameter
    const skip = (page - 1) * limit; // Calculate the number of documents to skip

    const hostels = Array.from(hostelCache.values());
    const totalHostels = hostels.length;

    // Slice the cached data to get the current page of hostels
    const paginatedHostels = hostels.slice(skip, skip + limit);

    res.json({
        totalPages: Math.ceil(totalHostels / limit),
        currentPage: page,
        hostels: paginatedHostels
    });
});

// Route to filter hostels by category and rating
app.get('/hostels', (req, res) => {
    const { category, rating } = req.query;
    let filteredHostels = Array.from(hostelCache.values());

    if (category) {
        filteredHostels = filteredHostels.filter(h => h.category === category);
        console.log(`Filtering by category: ${category}`);
    }

    if (rating) {
        const parsedRating = parseFloat(rating);
        if (!isNaN(parsedRating)) {
            filteredHostels = filteredHostels.filter(h => h.rating >= parsedRating);
            console.log(`Filtering by rating: ${parsedRating}`);
        } else {
            return res.status(400).json({ message: 'Invalid rating value provided' });
        }
    }

    console.log(`Found ${filteredHostels.length} hostels matching the query.`);
    res.json(filteredHostels);
});

// Route for search requests
app.post('/search', (req, res) => {
    const { query } = req.body;

    // Normalize the search query: lowercase and remove non-alphanumeric characters
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Filter hostelCache based on normalized location or name
    const searchResults = Array.from(hostelCache.values()).filter(h => {
        const normalizedLocation = h.location.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedName = h.name.toLowerCase().replace(/[^a-z0-9]/g, '');

        return normalizedLocation.includes(normalizedQuery) || normalizedName.includes(normalizedQuery);
    });

    res.json(searchResults);
});


// Route to get a limited number of hostels from cache
app.get('/hostel-limit', (req, res) => {
    const limit = parseInt(req.query.limit) || 5;
    const limitedHostels = Array.from(hostelCache.values()).slice(0, limit);
    res.json(limitedHostels);
});

// Start the server
app.listen(port, () => {
    console.log(`App is running on http://localhost:${port}`);
});
