import { query } from "../database/connection.js";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
//  npx tsx src/scripts/analyze_inventory.ts

interface Product {
  id: number;
  name: string;
  current_stock: number;
  min_required: number;
  cost_price: number;
}

interface Supplier {
  id: number;
  name: string;
  catalog_url: string;
}

interface LowStockProduct extends Product {
  suppliers: Supplier[];
  catalog_data?: any;
  catalog_error?: string;
}

interface CatalogResponse {
  supplier: string;
  url: string;
  data: any;
  timestamp: string;
}

// Configuración de la IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

class InventoryAnalyzer {
  private outputFile: string;

  constructor() {
    this.outputFile = path.join(process.cwd(), "REORDER_REPORT.md");
  }

  async analyzeInventory(): Promise<void> {
    try {
      console.log("🔍 Starting inventory analysis...");
      console.log("📊 Database connection check...");

      // Test database connection first
      try {
        const testResult = await query("SELECT 1 as test");
        console.log("✅ Database connection successful");
      } catch (dbError) {
        console.error("❌ Database connection failed:", dbError);
        throw dbError;
      }

      // Step 1: Get low-stock products
      console.log("📦 Checking for low-stock products...");
      const lowStockProducts = await this.getLowStockProducts();
      console.log(`Found ${lowStockProducts.length} low-stock products`);

      if (lowStockProducts.length === 0) {
        console.log("✅ No low-stock products found. Inventory is healthy!");
        await this.generateReport([], "No low-stock products detected.");
        return;
      }

      console.log(`⚠️  Found ${lowStockProducts.length} low-stock products:`);
      lowStockProducts.forEach((p, i) => {
        console.log(
          `   ${i + 1}. ${p.name} - Stock: ${p.current_stock}/${p.min_required}`,
        );
      });

      // Step 2: Get all suppliers
      console.log("🏭 Fetching suppliers...");
      const suppliers = await this.getAllSuppliers();
      console.log(`📋 Found ${suppliers.length} suppliers`);
      suppliers.forEach((s, i) => {
        console.log(
          `   ${i + 1}. ${s.name} - Catalog: ${s.catalog_url || "None"}`,
        );
      });

      // Step 3: Enrich products with supplier information
      const enrichedProducts = lowStockProducts.map((product) => ({
        ...product,
        suppliers: suppliers,
      }));

      // Step 4: Fetch catalog data for products with suppliers
      console.log("🌐 Fetching catalog data...");
      const productsWithCatalog = await this.fetchCatalogData(enrichedProducts);

      // Step 5: Generate report
      console.log("📝 Generating report...");
      await this.generateReport(
        productsWithCatalog,
        "Inventory analysis completed successfully.",
      );

      console.log("📊 Report generated: REORDER_REPORT.md");
      console.log("✅ Inventory analysis completed!");
    } catch (error) {
      console.error("❌ Error during inventory analysis:", error);
      await this.generateReport(
        [],
        `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      process.exit(1);
    }
  }

  private async getLowStockProducts(): Promise<Product[]> {
    const result = await query(
      `SELECT id, name, current_stock, min_required, cost_price 
       FROM products 
       WHERE current_stock <= min_required 
       ORDER BY (current_stock * 1.0 / min_required) ASC`,
    );
    return result.rows;
  }

  private async getAllSuppliers(): Promise<Supplier[]> {
    const result = await query(
      "SELECT id, name, catalog_url FROM suppliers WHERE catalog_url IS NOT NULL AND catalog_url != ''",
    );
    return result.rows;
  }

  private async fetchCatalogData(
    products: LowStockProduct[],
  ): Promise<LowStockProduct[]> {
    const results: LowStockProduct[] = [];

    for (const product of products) {
      const productWithCatalog: LowStockProduct = {
        ...product,
        catalog_data: undefined,
        catalog_error: undefined,
      };

      // Try to fetch catalog data from each supplier
      for (const supplier of product.suppliers) {
        if (supplier.catalog_url) {
          try {
            console.log(
              `🌐 Fetching catalog for ${product.name} from ${supplier.name}...`,
            );

            const response = await axios.get(supplier.catalog_url, {
              timeout: 10000,
              headers: {
                "User-Agent": "Inventory-Analyzer/1.0",
              },
            });

            productWithCatalog.catalog_data = {
              supplier: supplier.name,
              url: supplier.catalog_url,
              data: response.data,
              timestamp: new Date().toISOString(),
            };

            console.log(
              `✅ Successfully fetched catalog for ${product.name} from ${supplier.name}`,
            );
            break; // Stop after first successful fetch
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            productWithCatalog.catalog_error = `Failed to fetch from ${supplier.name}: ${errorMessage}`;
            console.warn(
              `❌ Failed to fetch catalog for ${product.name} from ${supplier.name}:`,
              errorMessage,
            );
          }
        }
      }

      results.push(productWithCatalog);
    }

    return results;
  }

  private async generateReport(
    products: LowStockProduct[],
    summary: string,
  ): Promise<void> {
    const reportContent = this.buildReportContent(products, summary);

    try {
      await fs.writeFile(this.outputFile, reportContent, "utf-8");
    } catch (error) {
      console.error("❌ Failed to write report file:", error);
      throw error;
    }
  }

  private buildReportContent(
    products: LowStockProduct[],
    summary: string,
  ): string {
    const timestamp = new Date().toISOString();

    let content = `# Inventory Reorder Report

**Generated:** ${timestamp}
**Summary:** ${summary}

`;

    if (products.length === 0) {
      content +=
        "## No Action Required\n\nAll products have sufficient stock levels.\n";
      return content;
    }

    content += `## Low Stock Products (${products.length})\n\n`;

    products.forEach((product, index) => {
      const stockRatio = (
        (product.current_stock / product.min_required) *
        100
      ).toFixed(1);
      const needed = product.min_required - product.current_stock;

      content += `### ${index + 1}. ${product.name}
- **Current Stock:** ${product.current_stock}
- **Minimum Required:** ${product.min_required}
- **Stock Level:** ${stockRatio}%
- **Need to Order:** ${needed} units
- **Product Cost:** $${product.cost_price} for units
- **Estimated Total Cost:** $${(needed * product.cost_price).toFixed(2)}

`;

      if (product.catalog_data) {
        content += `**Catalog Information:**
- **Supplier:** ${product.catalog_data.supplier}
- **Catalog URL:** ${product.catalog_data.url}
- **Fetched:** ${product.catalog_data.timestamp}
- **Data Available:** Yes (${typeof product.catalog_data.data === "object" ? "JSON object" : "raw data"})

`;
      } else if (product.catalog_error) {
        content += `**Catalog Status:** ❌ ${product.catalog_error}\n\n`;
      } else {
        content += `**Catalog Status:** ⚠️ No suppliers with catalog URLs available\n\n`;
      }

      content += `**Recommendation:** 
- Order ${needed} units immediately
- Contact supplier${product.catalog_data ? ` (${product.catalog_data.supplier})` : ""} for pricing and availability
- Consider increasing minimum stock level to ${Math.ceil(product.min_required * 1.2)} units

---\n\n`;
    });

    content += `## Summary

**Total Products Needing Reorder:** ${products.length}
**Total Units Needed:** ${products.reduce((sum, p) => sum + (p.min_required - p.current_stock), 0)}
**Estimated Total Cost:** $${products.reduce((sum, p) => sum + (p.min_required - p.current_stock) * p.cost_price, 0).toFixed(2)}

**Next Steps:**
1. Review each product recommendation above
2. Contact suppliers for current pricing
3. Place orders for critical items
4. Update inventory levels after receiving shipments
5. Consider adjusting minimum stock requirements for frequently low items

*Report generated by Inventory Analyzer Script*`;

    return content;
  }
}

// Main execution
async function main() {
  console.log("🚀 Initializing script execution...");
  const analyzer = new InventoryAnalyzer();
  await analyzer.analyzeInventory();
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main().catch((err) => {
  console.error("❌ Fatal Error during execution:", err);
  process.exit(1);
});

export { InventoryAnalyzer };
