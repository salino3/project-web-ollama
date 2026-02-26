import { query } from "../database/connection.js";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
//  npx tsx src/scripts/analyze_inventory.ts

// Load environment variables
dotenv.config();

// AI Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
  ai_updated_price?: number;
}
class InventoryAnalyzer {
  private outputFile: string;

  constructor() {
    this.outputFile = path.join(process.cwd(), "REORDER_REPORT.md");
  }

  private async getPriceWithAI(
    productName: string,
    catalogData: any,
  ): Promise<number | null> {
    try {
      const prompt = `
        Analyze this supplier catalog data and find the CURRENT UNIT PRICE for: "${productName}".
        Catalog Data: ${JSON.stringify(catalogData).substring(0, 3000)}
        
        Return ONLY the numerical price (e.g., 5.50). 
        If you cannot find it, return "null".
      `;

      const result = await aiModel.generateContent(prompt);
      const text = result.response.text().trim();

      // Clean up the response in case AI adds markdown
      const cleanText = text.replace(/[^0-9.]/g, "");
      return cleanText !== "" ? parseFloat(cleanText) : null;
    } catch (e) {
      console.error(`🤖 AI parsing error for ${productName}:`, e);
      return null;
    }
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
        ai_updated_price: undefined, // Initialize the new field
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

            // --- AI INTEGRATION START ---
            // We call the Gemini method here to parse the raw data we just downloaded
            console.log(
              `🤖 AI is analyzing the catalog for ${product.name} price...`,
            );
            const extractedPrice = await this.getPriceWithAI(
              product.name,
              response.data,
            );

            if (extractedPrice !== null) {
              productWithCatalog.ai_updated_price = extractedPrice;
              console.log(`✨ AI found a current price: $${extractedPrice}`);
            } else {
              console.log(
                `ℹ️ AI could not find a specific price for this item in the catalog.`,
              );
            }
            // --- AI INTEGRATION END ---

            break; // Stop after first successful fetch and AI analysis
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

    let content = `# 🤖 Smart Inventory Reorder Report

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
      const dbPrice = Number(product.cost_price);
      const aiPrice = product.ai_updated_price
        ? Number(product.ai_updated_price)
        : null;

      // We prioritize the AI price for the calculation, but fallback to DB
      const currentPrice = aiPrice || dbPrice;
      const needed = product.min_required - product.current_stock;
      const totalCost = needed * currentPrice;

      // Logic for the Savings/Warning badge
      let savingsMarkdown = "";
      if (aiPrice) {
        if (aiPrice < dbPrice) {
          const totalSaving = (dbPrice - aiPrice) * needed;
          savingsMarkdown = `\n> 💰 **Saving Opportunity:** AI found a lower price! Potential savings: **$${totalSaving.toFixed(2)}**`;
        } else if (aiPrice > dbPrice) {
          const totalIncrease = (aiPrice - dbPrice) * needed;
          savingsMarkdown = `\n> ⚠️ **Price Warning:** Market price is higher than your DB. Extra cost: **$${totalIncrease.toFixed(2)}**`;
        }
      }

      const stockRatio = (
        (product.current_stock / product.min_required) *
        100
      ).toFixed(1);

      content += `### ${index + 1}. ${product.name}
- **Current Stock:** ${product.current_stock} / ${product.min_required} (${stockRatio}%)
- **Database Price:** $${dbPrice.toFixed(2)}
- **Market Price (AI):** ${aiPrice ? `$${aiPrice.toFixed(2)}` : "*(Not found in catalog)*"}
- **Need to Order:** ${needed} units
- **Estimated Investment:** **$${totalCost.toFixed(2)}** ${savingsMarkdown}

`;

      if (product.catalog_data) {
        content += `**Catalog Information:**
- **Supplier:** ${product.catalog_data.supplier}
- **Catalog URL:** ${product.catalog_data.url}
- **Data Status:** Analysis verified by Gemini AI

`;
      } else if (product.catalog_error) {
        content += `**Catalog Status:** ❌ ${product.catalog_error}\n\n`;
      }

      content += `**Recommendation:** - Order ${needed} units immediately
- Contact ${product.catalog_data?.supplier || "supplier"} to lock in the price of $${currentPrice.toFixed(2)}
- Consider increasing minimum stock level to ${Math.ceil(product.min_required * 1.2)} units

---\n\n`;
    });

    // Final calculations for the Summary
    const totalUnits = products.reduce(
      (sum, p) => sum + (p.min_required - p.current_stock),
      0,
    );

    const grandTotalCost = products.reduce((sum, p) => {
      const price = p.ai_updated_price
        ? Number(p.ai_updated_price)
        : Number(p.cost_price);
      const qty = p.min_required - p.current_stock;
      return sum + qty * price;
    }, 0);

    const totalPotentialSavings = products.reduce((sum, p) => {
      if (p.ai_updated_price && p.ai_updated_price < p.cost_price) {
        return (
          sum +
          (p.cost_price - p.ai_updated_price) *
            (p.min_required - p.current_stock)
        );
      }
      return sum;
    }, 0);

    content += `## Summary

**Total Products Needing Reorder:** ${products.length}
**Total Units Needed:** ${totalUnits}
**Estimated Total Cost:** $${grandTotalCost.toFixed(2)}
**Potential Total Savings:** $${totalPotentialSavings.toFixed(2)}

**Next Steps:**
1. Review AI-verified market prices vs. your database records.
2. Confirm availability with suppliers before placing orders.
3. Update local database costs if market prices have shifted permanently.

*Report generated by AI-Enhanced Inventory Analyzer*`;

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
