export interface Supplier {
  id: number;
  name: string;
  catalog_url: string;
}

export interface CreateSupplierRequest {
  name: string;
  catalog_url: string | undefined;
}

export interface UpdateSupplierRequest {
  name?: string;
  catalog_url?: string;
}
