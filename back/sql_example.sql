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

-- Seed data for testing
-- INSERT INTO products (name, current_stock, cost_price, min_required) 
-- VALUES ('Ultrasonic Sensor', 2, 5.50, 10);

-- INSERT INTO suppliers (name, catalog_url) 
-- VALUES ('TechSupply', 'https://example.com/sensors');