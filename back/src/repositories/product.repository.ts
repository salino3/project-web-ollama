import { query } from "../database/connection.js";
import {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
} from "../models/product.model.js";

export class ProductRepository {
  async findAll(): Promise<Product[]> {
    const result = await query("SELECT * FROM products ORDER BY id");
    return result.rows;
  }

  async findById(id: number): Promise<Product | null> {
    const result = await query("SELECT * FROM products WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  async create(productData: CreateProductRequest): Promise<Product> {
    const result = await query(
      "INSERT INTO products (name, current_stock, cost_price, min_required) VALUES ($1, $2, $3, $4) RETURNING *",
      [
        productData.name,
        productData.current_stock || 0,
        productData.cost_price || 0,
        productData.min_required || 5,
      ],
    );
    return result.rows[0];
  }

  async update(
    id: number,
    productData: UpdateProductRequest,
  ): Promise<Product | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (productData.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(productData.name);
    }
    if (productData.current_stock !== undefined) {
      fields.push(`current_stock = $${paramCount++}`);
      values.push(productData.current_stock);
    }
    if (productData.cost_price !== undefined) {
      fields.push(`cost_price = $${paramCount++}`);
      values.push(productData.cost_price);
    }
    if (productData.min_required !== undefined) {
      fields.push(`min_required = $${paramCount++}`);
      values.push(productData.min_required);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $${paramCount} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await query("DELETE FROM products WHERE id = $1", [id]);
    if (result && result.rowCount) {
      return result.rowCount > 0;
    }
    return false;
  }

  async findLowStock(): Promise<Product[]> {
    const result = await query(
      "SELECT * FROM products WHERE current_stock <= min_required ORDER BY current_stock ASC",
    );
    return result.rows;
  }
}
