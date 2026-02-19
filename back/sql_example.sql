-- Table for products
IF NOT EXISTS CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    current_stock INTEGER DEFAULT 0,
    cost_price DECIMAL(10, 2),
    min_required INTEGER DEFAULT 5 -- Alert threshold for the AI
);

-- Table for suppliers
IF NOT EXISTS CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    catalog_url TEXT -- Used later with MCP Fetch
);

-- 3. Sales Table (The "Intelligence" Table)
IF NOT EXISTS CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sale_price DECIMAL(10, 2) NOT NULL
);

-- 

-- Seed data for testing
INSERT INTO products (name, current_stock, cost_price, min_required) 
VALUES ('Ultrasonic Sensor', 2, 5.50, 10);

INSERT INTO suppliers (name, catalog_url) 
VALUES ('TechSupply', 'https://example.com/sensors');

INSERT INTO sales (product_id, quantity, sale_price) 
VALUES (1, 5, 12.00); -- Sold 5 units  