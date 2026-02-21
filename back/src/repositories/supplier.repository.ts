import { query } from "../database/connection.js";
import {
  Supplier,
  CreateSupplierRequest,
  UpdateSupplierRequest,
} from "../models/supplier.model.js";

export class SupplierRepository {
  async findAll(): Promise<Supplier[]> {
    const result = await query("SELECT * FROM suppliers ORDER BY id");
    return result.rows;
  }

  async findById(id: number): Promise<Supplier | null> {
    const result = await query("SELECT * FROM suppliers WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  async create(supplierData: CreateSupplierRequest): Promise<Supplier> {
    const result = await query(
      "INSERT INTO suppliers (name, catalog_url) VALUES ($1, $2) RETURNING *",
      [supplierData.name, supplierData.catalog_url],
    );
    return result.rows[0];
  }

  async update(
    id: number,
    supplierData: UpdateSupplierRequest,
  ): Promise<Supplier | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (supplierData.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(supplierData.name);
    }
    if (supplierData.catalog_url !== undefined) {
      fields.push(`catalog_url = $${paramCount++}`);
      values.push(supplierData.catalog_url);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await query(
      `UPDATE suppliers SET ${fields.join(", ")} WHERE id = $${paramCount} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await query("DELETE FROM suppliers WHERE id = $1", [id]);
    return (result.rowCount || 0) > 0;
  }
}
