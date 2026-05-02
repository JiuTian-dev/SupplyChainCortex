import { create } from 'zustand';

// ==================== Supplier UI Store ====================
// Extracted from ui-store.ts — supplier management state only

interface NewSupplier {
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
}

interface SupplierUIState {
  supplierFilter: string;
  supplierRegionFilter: string;
  expandedSupplier: string | null;
  addSupplierOpen: boolean;
  newSupplier: NewSupplier;
  selectedSupplier: unknown | null;
  supplierDetailOpen: boolean;
  supplierSearchQuery: string;
  supplierStatusFilter: string;
  editSupplierOpen: boolean;
  editingSupplier: unknown | null;
}

interface SupplierUIActions {
  setSupplierFilter: (f: string) => void;
  setSupplierRegionFilter: (f: string) => void;
  setExpandedSupplier: (id: string | null) => void;
  setAddSupplierOpen: (open: boolean) => void;
  setNewSupplier: (supplier: NewSupplier) => void;
  updateNewSupplierField: <K extends keyof NewSupplier>(key: K, value: NewSupplier[K]) => void;
  setSelectedSupplier: (supplier: unknown | null) => void;
  setSupplierDetailOpen: (open: boolean) => void;
  setSupplierSearchQuery: (q: string) => void;
  setSupplierStatusFilter: (f: string) => void;
  setEditSupplierOpen: (open: boolean) => void;
  setEditingSupplier: (supplier: unknown | null) => void;
}

export const useSupplierUIStore = create<SupplierUIState & SupplierUIActions>((set) => ({
  supplierFilter: 'all',
  supplierRegionFilter: 'all',
  expandedSupplier: null,
  addSupplierOpen: false,
  newSupplier: { code: '', name: '', contact: '', email: '', phone: '', region: '', category: '', leadTime: 14, rating: 0 },
  selectedSupplier: null,
  supplierDetailOpen: false,
  supplierSearchQuery: '',
  supplierStatusFilter: 'all',
  editSupplierOpen: false,
  editingSupplier: null,

  setSupplierFilter: (f) => set({ supplierFilter: f }),
  setSupplierRegionFilter: (f) => set({ supplierRegionFilter: f }),
  setExpandedSupplier: (id) => set({ expandedSupplier: id }),
  setAddSupplierOpen: (open) => set({ addSupplierOpen: open }),
  setNewSupplier: (supplier) => set({ newSupplier: supplier }),
  updateNewSupplierField: (key, value) =>
    set((state) => ({ newSupplier: { ...state.newSupplier, [key]: value } })),
  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),
  setSupplierDetailOpen: (open) => set({ supplierDetailOpen: open }),
  setSupplierSearchQuery: (q) => set({ supplierSearchQuery: q }),
  setSupplierStatusFilter: (f) => set({ supplierStatusFilter: f }),
  setEditSupplierOpen: (open) => set({ editSupplierOpen: open }),
  setEditingSupplier: (supplier) => set({ editingSupplier: supplier }),
}));
