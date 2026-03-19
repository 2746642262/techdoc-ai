import { get, set, del, clear } from 'idb-keyval';

/**
 * Storage service using IndexedDB for large data and localStorage for small data.
 * IndexedDB has a much larger quota (usually a percentage of disk space) 
 * compared to localStorage (usually 5MB).
 */
export const storage = {
  /**
   * Get data from IndexedDB (async)
   */
  async getLarge(key: string): Promise<any> {
    try {
      return await get(key);
    } catch (error) {
      console.error(`Failed to get ${key} from IndexedDB`, error);
      return null;
    }
  },

  /**
   * Set data in IndexedDB (async)
   */
  async setLarge(key: string, value: any): Promise<void> {
    try {
      await set(key, value);
    } catch (error) {
      console.error(`Failed to set ${key} in IndexedDB`, error);
      throw error;
    }
  },

  /**
   * Delete data from IndexedDB (async)
   */
  async deleteLarge(key: string): Promise<void> {
    try {
      await del(key);
    } catch (error) {
      console.error(`Failed to delete ${key} from IndexedDB`, error);
    }
  },

  /**
   * Clear all IndexedDB data
   */
  async clearAllLarge(): Promise<void> {
    try {
      await clear();
    } catch (error) {
      console.error('Failed to clear IndexedDB', error);
    }
  },

  /**
   * Get data from localStorage (sync)
   */
  getSmall(key: string): any {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Failed to get ${key} from localStorage`, error);
      return null;
    }
  },

  /**
   * Set data in localStorage (sync)
   */
  setSmall(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to set ${key} in localStorage`, error);
    }
  }
};
