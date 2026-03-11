import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ProductService } from "./services/product.service.js";
import { McpService } from "./services/mcp.service.js";
import { SupplierRepository } from "./repositories/supplier.repository.js";
import { SaleService } from "./services/sale.service.js";

const app = express();
dotenv.config();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const productService = new ProductService();
const mcpService = new McpService();
const supplierRepository = new SupplierRepository();
const saleService = new SaleService();

// Product Routes
app.get("/api/products", async (req, res) => {
  try {
    const products = await productService.getAllProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await productService.getProductById(
      parseInt(req.params.id),
    );
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const product = await productService.createProduct(req.body);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

// Supplier Routes
app.get("/api/suppliers", async (req, res) => {
  try {
    const suppliers = await supplierRepository.findAll();
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

app.post("/api/suppliers", async (req: Request, res: Response) => {
  const { name, catalog_url } = req.body;
  try {
    const suppliers = await supplierRepository.create({ name, catalog_url });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: "Failed to add supplier" });
  }
});

// MCP Tool Routes
app.get("/api/mcp/low-stock-alerts", async (req, res) => {
  try {
    const alerts = await mcpService.getLowStockAlertsWithSupplierInfo();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch low stock alerts" });
  }
});

app.get("/api/mcp/analytics", async (req, res) => {
  try {
    const analytics = await mcpService.analyzeProductPerformance();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

app.get("/api/mcp/fetch-catalog/:supplierId", async (req, res) => {
  try {
    const catalog = await mcpService.fetchSupplierCatalog(
      parseInt(req.params.supplierId),
    );
    res.json(catalog);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch catalog",
    });
  }
});

// Sales Routes
app.post("/api/sales", async (req, res) => {
  try {
    const result = await saleService.createMultipleSales(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("Insufficient stock") ||
        error.message.includes("Product not found")
      ) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create sale" });
      }
    } else {
      res.status(500).json({ error: "Failed to create sale" });
    }
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
