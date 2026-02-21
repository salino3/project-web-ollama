import { ProductService } from "./product.service.js";
import { SupplierRepository } from "../repositories/supplier.repository.js";
import { SaleRepository } from "../repositories/sale.repository.js";
import axios from "axios";

export class McpService {
  private productService: ProductService;
  private supplierRepository: SupplierRepository;
  private saleRepository: SaleRepository;

  constructor() {
    this.productService = new ProductService();
    this.supplierRepository = new SupplierRepository();
    this.saleRepository = new SaleRepository();
  }

  // Tool to fetch supplier catalog data
  async fetchSupplierCatalog(supplierId: number) {
    const supplier = await this.supplierRepository.findById(supplierId);
    if (!supplier) {
      throw new Error("Supplier not found");
    }

    if (!supplier.catalog_url) {
      throw new Error("Supplier does not have a catalog URL");
    }

    try {
      const response = await axios.get(supplier.catalog_url, {
        timeout: 10000,
        headers: {
          "User-Agent": "MCP-Fetch-Backend/1.0",
        },
      });

      return {
        supplier: supplier.name,
        url: supplier.catalog_url,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch catalog: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Tool to get low stock alerts with supplier information
  async getLowStockAlertsWithSupplierInfo() {
    const lowStockAlerts = await this.saleRepository.getLowStockAlerts();

    const alertsWithSuppliers = await Promise.all(
      lowStockAlerts.map(async (alert) => {
        const suppliers = await this.supplierRepository.findAll();
        return {
          ...alert,
          available_suppliers: suppliers.map((supplier) => ({
            id: supplier.id,
            name: supplier.name,
            catalog_url: supplier.catalog_url,
          })),
        };
      }),
    );

    return alertsWithSuppliers;
  }

  // Tool to analyze product performance
  async analyzeProductPerformance() {
    const analytics = await this.saleRepository.getSalesAnalytics();
    const products = await this.productService.getAllProducts();

    return analytics.map((analytic) => {
      const product = products.find((p) => p.id === analytic.product_id);
      return {
        ...analytic,
        current_stock: product?.current_stock || 0,
        min_required: product?.min_required || 0,
        stock_status:
          product && product.current_stock <= product.min_required
            ? "LOW_STOCK"
            : "OK",
      };
    });
  }

  // Tool to simulate ordering from supplier
  async simulateOrder(productId: number, supplierId: number, quantity: number) {
    const product = await this.productService.getProductById(productId);
    const supplier = await this.supplierRepository.findById(supplierId);

    if (!product) {
      throw new Error("Product not found");
    }
    if (!supplier) {
      throw new Error("Supplier not found");
    }

    // Simulate API call to supplier (in real scenario, this would be actual API integration)
    const orderResult = {
      success: true,
      order_id: `ORD_${Date.now()}`,
      product_id: productId,
      product_name: product.name,
      supplier: supplier.name,
      quantity_ordered: quantity,
      estimated_cost: product.cost_price * quantity,
      estimated_delivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      timestamp: new Date().toISOString(),
    };

    return orderResult;
  }

  // Tool to create supplier using SupplierRepository
  async createSupplier(name: string, catalog_url?: string) {
    const result = await this.supplierRepository.create({ name, catalog_url });
    return result;
  }

  // Tool to update supplier using SupplierRepository
  async updateSupplier(id: number, name?: string, catalog_url?: string) {
    const result = await this.supplierRepository.update(id, {
      name,
      catalog_url,
    });
    return result;
  }
}
