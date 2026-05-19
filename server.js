const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// 1. Database Connection Configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ecommerce_db',
    password: 'Pradheeksha', // Unga PostgreSQL password inga correct-ah irukanum
    port: 5432,
});

// 2. Middleware Settings
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session Configuration (Login memory-kaaga)
app.use(session({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Local Variables (EJS-la use panna)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.cart = req.session.cart || [];
    next();
});

// 3. ROUTES - AUTHENTICATION (Login/Register)

app.get('/login', (req, res) => res.render('login'));

app.post('/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', 
            [username, hashedPassword, role || 'user']);
        res.redirect('/login');
    } catch (err) {
        console.error("Register Error:", err);
        res.send("Registration failed. Username might be taken.");
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                req.session.user = { id: user.id, username: user.username, role: user.role };
                return res.redirect('/');
            }
        }
        res.send("Invalid Username or Password!");
    } catch (err) {
        console.error("Login Error:", err);
        res.send("Login error occurred.");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// 4. ROUTES - SHOP (Index & Cart)

app.get('/', async (req, res) => {
    try {
        const productsData = await pool.query('SELECT * FROM products');
        res.render('index', { products: productsData.rows });
    } catch (err) {
        res.send("Error loading products.");
    }
});

app.post('/add-to-cart', (req, res) => {
    const { productId, name, price } = req.body;
    if (!req.session.cart) req.session.cart = [];
    req.session.cart.push({ id: productId, name, price: parseFloat(price) });
    res.redirect('/');
});

app.post('/checkout', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const cartItems = req.session.cart || [];
    if (cartItems.length === 0) return res.redirect('/');

    const totalPrice = cartItems.reduce((acc, curr) => acc + curr.price, 0);
    const itemsList = cartItems.map(i => i.name).join(', ');

    try {
        await pool.query('INSERT INTO orders (user_id, total_price, items) VALUES ($1, $2, $3)', 
            [req.session.user.id, totalPrice, itemsList]);
        req.session.cart = []; // Empty cart after order
        res.redirect('/orders');
    } catch (err) {
        res.send("Checkout failed.");
    }
});

app.get('/orders', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC', [req.session.user.id]);
        res.render('orders', { orders: result.rows });
    } catch (err) {
        res.send("Error loading orders.");
    }
});

// 5. ROUTES - ADMIN (Product Management)

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).send("Access Denied: Admins Only!");
};

app.get('/admin', isAdmin, async (req, res) => {
    try {
        const products = await pool.query('SELECT * FROM products ORDER BY id DESC');
        const orders = await pool.query('SELECT orders.*, users.username FROM orders JOIN users ON orders.user_id = users.id ORDER BY orders.id DESC');
        res.render('admin', { products: products.rows, orders: orders.rows });
    } catch (err) {
        res.send("Admin panel error.");
    }
});

app.post('/admin/add-product', isAdmin, async (req, res) => {
    const { name, price, description, image_url } = req.body;
    try {
        await pool.query('INSERT INTO products (name, price, description, image_url) VALUES ($1, $2, $3, $4)', 
            [name, price, description, image_url]);
        res.redirect('/admin');
    } catch (err) {
        res.send("Failed to add product.");
    }
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});