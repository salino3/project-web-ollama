import { query } from "../database/connection.js";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
// import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import dotenv from "dotenv";
//  npx tsx src/scripts/analyze_inventory.ts

// Load environment variables
dotenv.config();

// AI Configuration
const groq = new Groq({
  apiKey: process.env.AI_API_KEY,
});
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// const aiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

//
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
  ai_advice?: string; // New: Expert tips
  ai_source?: string; // New: Where the price came from
}
class InventoryAnalyzer {
  private outputFile: string;

  constructor() {
    this.outputFile = path.join(process.cwd(), "REORDER_REPORT.md");
  }

  // TODO: implement it
  private async scrapeLinkWithSerper(url: string): Promise<string> {
    const apiKey = process.env.AI_API_KEY_02;
    try {
      const response = await axios.post(
        "https://scrape.serper.dev",
        { url: url },
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      // Serper devuelve el contenido de la web ya procesado
      return response.data.text || "No content found on page.";
    } catch (error: any) {
      console.error(`❌ Serper Scrape failed for ${url}:`, error.message);
      return "SCRAPE_FAILED";
    }
  }

  //#region - Serper - start
  private async searchWeb(productQuery: string): Promise<string> {
    const apiKey = process.env.AI_API_KEY_02;

    if (!apiKey) {
      console.error("❌ Serper API Key is missing in .env (AI_API_KEY_02)");
      return "No search key provided.";
    }

    try {
      const response = await axios.post(
        "https://google.serper.dev/search",
        {
          q: `${productQuery} price 2026 electronics store`,
          num: 3,
        },
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );

      if (!response.data.organic || response.data.organic.length === 0) {
        return "No organic search results found.";
      }

      return response.data.organic
        .slice(0, 3)
        .map(
          (result: any) => `Source: ${result.link} | Info: ${result.snippet}`,
        )
        .join("\n");
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.error(`⚠️ Serper Error [${status}]: ${message}`);
      return "Search failed due to API connection issue.";
    }
  }

  //#endregion - Serper - end

  private sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  private async getPriceWithAI(
    productName: string,
    catalogData: any,
  ): Promise<{
    price: number | null;
    advice: string;
    source: string;
    url?: string;
  }> {
    try {
      await this.sleep(2000);

      let webResults = "";
      if (
        catalogData === "USE_MARKET_KNOWLEDGE_ONLY" ||
        catalogData === "CATALOG_UNAVAILABLE_USE_SEARCH"
      ) {
        console.log(`🔍 Trying real search on Google for: ${productName}...`);
        webResults = await this.searchWeb(productName);
      }

      const contextSnippet =
        typeof catalogData === "string"
          ? catalogData.substring(0, 500)
          : JSON.stringify(catalogData).substring(0, 500);

      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: `TASK: Research 2026 market price and tech tip for: "${productName}".
          
          CONTEXT FROM LOCAL CATALOG: ${contextSnippet}
          
          REAL-TIME WEB SEARCH RESULTS: 
          ${webResults}
          
          STRICT RULES:
          1. Use the WEB SEARCH RESULTS to find the current price and a valid purchase URL.
          2. If WEB SEARCH RESULTS are empty, use your internal knowledge.
          3. Output ONLY a raw JSON object.
          
          JSON SCHEMA:
          {
            "price": number,
            "source": "verified_market_search",
            "advice": "string",
            "purchase_url": "string"
          }`,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(
        completion.choices[0]?.message?.content || "{}",
      );

      return {
        price: typeof parsed.price === "number" ? parsed.price : null,
        advice: parsed.advice || "No specific advice.",
        source: parsed.source || "groq_analysis",
        url: parsed.purchase_url || null,
      };
    } catch (e: any) {
      console.error("Groq logic failed:", e.message);
      return {
        price: null,
        advice: "Manual review required.",
        source: "error_fallback",
      };
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
      let productWithCatalog: LowStockProduct = { ...product };
      let foundPrice = false;

      for (const supplier of product.suppliers) {
        try {
          const isUselessLink = supplier.catalog_url.includes("github.com");
          const response = await axios.get(supplier.catalog_url, {
            timeout: 10000,
          });

          const aiResult = await this.getPriceWithAI(
            product.name,
            isUselessLink ? "USE_MARKET_KNOWLEDGE_ONLY" : response.data,
          );

          productWithCatalog.ai_advice = aiResult.advice;
          productWithCatalog.ai_source = aiResult.source;

          if (aiResult.price !== null) {
            productWithCatalog.ai_updated_price = aiResult.price;
            productWithCatalog.catalog_data = {
              supplier: isUselessLink ? "Market Suggestion" : supplier.name,
              url: isUselessLink
                ? aiResult.url || supplier.catalog_url
                : supplier.catalog_url,
            };
            foundPrice = true;
            break;
          }
        } catch (error) {
          productWithCatalog.catalog_error = "Catalog unreachable";
        }
      }

      if (!foundPrice) {
        const marketKnowledge = await this.getPriceWithAI(
          product.name,
          "USE_MARKET_KNOWLEDGE_ONLY",
        );
        productWithCatalog.ai_advice = marketKnowledge.advice;

        productWithCatalog.ai_source = "google_serper_search";

        productWithCatalog.ai_updated_price =
          marketKnowledge.price ?? undefined;
        productWithCatalog.catalog_data = {
          supplier: "Google Search Result",
          url: marketKnowledge.url || "...",
        };
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
    const timestamp = new Date().toLocaleString(); // Using local string for better readability

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

      // Logic: Use AI price if available, otherwise use Database price
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

      // Determine the Price Label with Source Icon
      const priceSourceIcon =
        product.ai_source === "catalog" ? "✅ (Catalog)" : "🌐 (Market Search)";
      const priceDisplay = aiPrice
        ? `$${aiPrice.toFixed(2)} ${priceSourceIcon}`
        : "*(Not found - using DB price)*";

      content += `### ${index + 1}. ${product.name}
- **Current Stock:** ${product.current_stock} / ${product.min_required} (${stockRatio}%)
- **Database Price:** $${dbPrice.toFixed(2)}
- **Market Price (AI):** ${priceDisplay}
- **Expert Advice:** *${product.ai_advice || "No specific advice found."}*
- **Need to Order:** ${needed} units
- **Estimated Investment:** **$${totalCost.toFixed(2)}** ${savingsMarkdown}

`;

      if (product.catalog_data) {
        content += `**Catalog Information:**
- **Supplier:** ${product.catalog_data.supplier}
- **Catalog URL:** ${product.catalog_data.url}
- **Analysis Status:** Verified by AI

`;
      } else if (product.catalog_error) {
        content += `**Catalog Status:** ❌ ${product.catalog_error} *(Using AI Market Average instead)*\n\n`;
      }

      content += `**Recommendation:**
- Order **${needed}** units immediately to reach safety levels.
- **Action:** ${aiPrice ? `Lock in price of $${aiPrice.toFixed(2)} via ${product.ai_source}` : `Contact supplier for current quote`}.
- **Safety Margin:** Consider increasing min stock to ${Math.ceil(product.min_required * 1.2)} units.

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
