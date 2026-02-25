import pool from "../database/connection.js";
import { CreateSaleRequest } from "../models/sale.model.js";

export class SaleService {
  async createSaleWithTransaction(saleData: CreateSaleRequest): Promise<any> {
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query("BEGIN");

      // Check if product exists and has enough stock
      const product = await client.query(
        "SELECT id, name, current_stock FROM products WHERE id = $1 FOR UPDATE",
        [saleData.product_id],
      );

      if (product.rows.length === 0) {
        throw new Error("Product not found");
      }

      const currentStock = product.rows[0].current_stock;

      if (currentStock < saleData.quantity) {
        throw new Error(
          `Insufficient stock. Available: ${currentStock}, Requested: ${saleData.quantity}`,
        );
      }

      // Update product stock
      await client.query(
        "UPDATE products SET current_stock = current_stock - $1 WHERE id = $2",
        [saleData.quantity, saleData.product_id],
      );

      // Create sale record
      const saleResult = await client.query(
        "INSERT INTO sales (product_id, quantity, sale_price) VALUES ($1, $2, $3) RETURNING *",
        [saleData.product_id, saleData.quantity, saleData.sale_price],
      );

      // Commit transaction
      await client.query("COMMIT");

      return {
        sale: saleResult.rows[0],
        previous_stock: currentStock,
        new_stock: currentStock - saleData.quantity,
      };
    } catch (error) {
      // Rollback transaction on error
      await client.query("ROLLBACK");
      throw error;
    } finally {
      // Release client back to pool
      client.release();
    }
  }
}
