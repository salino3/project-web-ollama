import { query } from "../database/connection.js";
import {
  Sale,
  CreateSaleRequest,
  SalesAnalytics,
} from "../models/sale.model.js";

export class SaleRepository {
  async findAll(): Promise<Sale[]> {
    const result = await query("SELECT * FROM sales ORDER BY sale_date DESC");
    return result.rows;
  }

  async findById(id: number): Promise<Sale | null> {
    const result = await query("SELECT * FROM sales WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  async findByProductId(productId: number): Promise<Sale[]> {
    const result = await query(
      "SELECT * FROM sales WHERE product_id = $1 ORDER BY sale_date DESC",
      [productId],
    );
    return result.rows;
  }

  async create(saleData: CreateSaleRequest): Promise<Sale> {
    const result = await query(
      "INSERT INTO sales (product_id, quantity, sale_price) VALUES ($1, $2, $3) RETURNING *",
      [saleData.product_id, saleData.quantity, saleData.sale_price],
    );
    return result.rows[0];
  }

  async delete(id: number): Promise<boolean> {
    const result = await query("DELETE FROM sales WHERE id = $1", [id]);
    return (result.rowCount || 0) > 0;
  }

  async getSalesAnalytics(): Promise<SalesAnalytics[]> {
    const result = await query(
      `SELECT 
         s.product_id,
         p.name as product_name,
         SUM(s.quantity) as total_sales,
         SUM(s.quantity * s.sale_price) as total_revenue,
         AVG(s.sale_price) as average_sale_price
       FROM sales s
       JOIN products p ON s.product_id = p.id
       GROUP BY s.product_id, p.name
       ORDER BY total_revenue DESC`,
    );
    return result.rows;
  }

  async getLowStockAlerts(): Promise<any[]> {
    const result = await query(
      `SELECT 
         p.id,
         p.name,
         p.current_stock,
         p.min_required,
         COALESCE(SUM(s.quantity), 0) as recent_sales
       FROM products p
       LEFT JOIN sales s ON p.id = s.product_id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE p.current_stock <= p.min_required
       GROUP BY p.id, p.name, p.current_stock, p.min_required
       ORDER BY (p.current_stock * 1.0 / p.min_required) ASC`,
    );
    return result.rows;
  }
}
