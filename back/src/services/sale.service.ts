import pool from "../database/connection.js";
import { CreateSaleRequest } from "../models/sale.model.js";

export class SaleService {
  //*  DB Restriction check_stock_not_negative added
  async createMultipleSales(saleItems: CreateSaleRequest[]): Promise<any> {
    const client = await pool.connect();

    try {
      // 1. Sort to avoid Deadlocks
      const sorted = [...saleItems].sort((a, b) => a.product_id - b.product_id);
      const ids = sorted.map((i) => i.product_id);
      const qtys = sorted.map((i) => i.quantity);
      const prices = sorted.map((i) => i.sale_price);

      // 'BEGIN' & 'FOR' & 'COMMIT' or 'ROLLBACK' obliges the secondo sql call to wait for the update of first process
      // it works on the row matches with id, no all table
      const atomicQuery = `
        WITH data AS (
          SELECT 
            UNNEST($1::int[]) as id, 
            UNNEST($2::int[]) as req_qty,
            UNNEST($3::numeric[]) as price
        ),
        updated AS (
          UPDATE products p
          SET current_stock = p.current_stock - d.req_qty
          FROM data d
          WHERE p.id = d.id
          RETURNING p.id
        )
        INSERT INTO sales (product_id, quantity, sale_price)
        SELECT d.id, d.req_qty, d.price FROM data d
        RETURNING *;
      `;

      await client.query("BEGIN");

      // If stock goes below 0, the DB throws an error here,
      // jumping straight to the catch/rollback block.
      const result = await client.query(atomicQuery, [ids, qtys, prices]);

      await client.query("COMMIT");
      return { success: true, sales: result.rows };
    } catch (error: any) {
      await client.query("ROLLBACK");
      // You can customize the error message for the frontend
      if (error.constraint === "check_stock_not_negative") {
        throw new Error(
          "Transaction failed: Insufficient stock for one or more items.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
