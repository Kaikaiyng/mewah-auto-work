import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  category: string;
  maxStock?: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_STORAGE_KEY = 'maw_customer_cart_v1';

function loadStoredCart(): CartItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const storedValue = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!storedValue) return [];

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.flatMap((value): CartItem[] => {
      if (!value || typeof value !== 'object') return [];

      const item = value as Partial<CartItem>;
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const maxStock = item.maxStock === undefined ? undefined : Number(item.maxStock);
      if (
        typeof item.id !== 'string'
        || typeof item.name !== 'string'
        || typeof item.image !== 'string'
        || typeof item.category !== 'string'
        || !Number.isFinite(price)
        || price < 0
        || !Number.isFinite(quantity)
        || quantity < 1
      ) {
        return [];
      }

      const normalizedMaxStock = maxStock !== undefined && Number.isFinite(maxStock)
        ? Math.max(0, Math.floor(maxStock))
        : undefined;
      if (normalizedMaxStock === 0) return [];

      return [{
        id: item.id,
        name: item.name,
        image: item.image,
        category: item.category,
        price,
        quantity: Math.min(
          Math.floor(quantity),
          normalizedMaxStock ?? Number.MAX_SAFE_INTEGER,
        ),
        maxStock: normalizedMaxStock,
      }];
    });
  } catch {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadStoredCart);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The cart remains usable for the current session if storage is unavailable.
    }
  }, [items]);

  const addToCart = (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find((i) => i.id === item.id);
      const requestedQuantity = Math.max(1, Math.floor(quantity));
      if (existingItem) {
        return prevItems.map((i) =>
          i.id === item.id
            ? {
                ...i,
                maxStock: item.maxStock ?? i.maxStock,
                quantity: Math.min(
                  i.quantity + requestedQuantity,
                  item.maxStock ?? i.maxStock ?? Number.MAX_SAFE_INTEGER,
                ),
              }
            : i
        );
      }
      return [
        ...prevItems,
        {
          ...item,
          quantity: Math.min(requestedQuantity, item.maxStock ?? Number.MAX_SAFE_INTEGER),
        },
      ];
    });
  };

  const removeFromCart = (id: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setItems((prevItems) =>
      prevItems.map((item) => (
        item.id === id
          ? { ...item, quantity: Math.min(quantity, item.maxStock ?? Number.MAX_SAFE_INTEGER) }
          : item
      ))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return items.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getTotalItems,
        getTotalPrice
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
