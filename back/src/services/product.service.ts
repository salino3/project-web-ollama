import { ProductRepository } from "../repositories/product.repository.js";
import { SaleRepository } from "../repositories/sale.repository.js";
import {
  CreateProductRequest,
  UpdateProductRequest,
} from "../models/product.model.js";

export class ProductService {
  private productRepository: ProductRepository;
  private saleRepository: SaleRepository;

  constructor() {
    this.productRepository = new ProductRepository();
    this.saleRepository = new SaleRepository();
  }

  async getAllProducts() {
    return await this.productRepository.findAll();
  }

  async getProductById(id: number) {
    return await this.productRepository.findById(id);
  }

  async createProduct(productData: CreateProductRequest) {
    return await this.productRepository.create(productData);
  }

  async updateProduct(id: number, productData: UpdateProductRequest) {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new Error("Product not found");
    }
    return await this.productRepository.update(id, productData);
  }

  async deleteProduct(id: number) {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new Error("Product not found");
    }
    return await this.productRepository.delete(id);
  }

  async getLowStockProducts() {
    const lowStockProducts = await this.productRepository.findLowStock();
    const productsWithSales = await Promise.all(
      lowStockProducts.map(async (product) => {
        const recentSales = await this.saleRepository.findByProductId(
          product.id,
        );
        return {
          ...product,
          recent_sales: recentSales.reduce(
            (sum, sale) => sum + sale.quantity,
            0,
          ),
        };
      }),
    );
    return productsWithSales;
  }

  async getProductAnalytics(id: number) {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new Error("Product not found");
    }

    const sales = await this.saleRepository.findByProductId(id);
    const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + sale.quantity * sale.sale_price,
      0,
    );
    const averageSalePrice = sales.length > 0 ? totalRevenue / totalSales : 0;

    return {
      product,
      sales_count: sales.length,
      total_sales: totalSales,
      total_revenue: totalRevenue,
      average_sale_price: averageSalePrice,
      sales,
    };
  }
}
