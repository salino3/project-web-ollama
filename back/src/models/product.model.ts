export interface Product {
  id: number;
  name: string;
  current_stock: number;
  cost_price: number;
  min_required: number;
}

export interface CreateProductRequest {
  name: string;
  current_stock?: number;
  cost_price?: number;
  min_required?: number;
}

export interface UpdateProductRequest {
  name?: string;
  current_stock?: number;
  cost_price?: number;
  min_required?: number;
}
