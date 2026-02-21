export interface Sale {
  id: number;
  product_id: number;
  quantity: number;
  sale_date: Date;
  sale_price: number;
}

export interface CreateSaleRequest {
  product_id: number;
  quantity: number;
  sale_price: number;
}

export interface SalesAnalytics {
  product_id: number;
  product_name: string;
  total_sales: number;
  total_revenue: number;
  average_sale_price: number;
}
