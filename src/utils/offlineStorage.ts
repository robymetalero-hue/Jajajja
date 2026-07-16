// Offline storage utility for GTR POS
// Manages offline sales queueing in IndexedDB with fallback to LocalStorage

const DB_NAME = 'gtr_pos_offline_db';
const STORE_NAME = 'offline_sales';
const DB_VERSION = 1;

export interface OfflineSale {
    id: string; // Unique temporary ID
    salePayload: any;
    clientName?: string;
    clientPhone?: string;
    createdAt: string;
}

// Memory fallback queue in case both IndexedDB and LocalStorage are inaccessible
let memoryQueue: OfflineSale[] = [];

/**
 * Safely opens IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB not supported'));
            return;
        }

        try {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                reject(request.error || new Error('Database open failed'));
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * LocalStorage Fallback functions
 */
function getLocalStorageQueue(): OfflineSale[] {
    try {
        const stored = localStorage.getItem('gtr_offline_sales_queue');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('LocalStorage fallback failed:', e);
        return memoryQueue;
    }
}

function saveLocalStorageQueue(queue: OfflineSale[]): void {
    try {
        localStorage.setItem('gtr_offline_sales_queue', JSON.stringify(queue));
    } catch (e) {
        console.warn('Saving to LocalStorage failed:', e);
        memoryQueue = queue;
    }
}

/**
 * Saves a sale to the offline queue
 */
export async function saveOfflineSale(salePayload: any, clientName?: string, clientPhone?: string): Promise<OfflineSale> {
    const offlineSale: OfflineSale = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        salePayload,
        clientName,
        clientPhone,
        createdAt: new Date().toISOString()
    };

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(offlineSale);

            request.onsuccess = () => {
                db.close();
                console.log('[Offline DB] Sale saved successfully to IndexedDB:', offlineSale.id);
                resolve(offlineSale);
            };

            request.onerror = () => {
                db.close();
                reject(request.error || new Error('Failed to save to IndexedDB'));
            };
        });
    } catch (err) {
        console.warn('[Offline DB] IndexedDB unavailable, falling back to LocalStorage:', err);
        const queue = getLocalStorageQueue();
        queue.push(offlineSale);
        saveLocalStorageQueue(queue);
        return offlineSale;
    }
}

/**
 * Retrieves all offline sales from the queue
 */
export async function getOfflineSales(): Promise<OfflineSale[]> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                db.close();
                resolve(request.result || []);
            };

            request.onerror = () => {
                db.close();
                reject(request.error || new Error('Failed to fetch from IndexedDB'));
            };
        });
    } catch (err) {
        console.warn('[Offline DB] IndexedDB fetch failed, using fallback:', err);
        return getLocalStorageQueue();
    }
}

/**
 * Deletes a sale from the offline queue
 */
export async function deleteOfflineSale(id: string): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                db.close();
                console.log('[Offline DB] Sale deleted from IndexedDB:', id);
                resolve();
            };

            request.onerror = () => {
                db.close();
                reject(request.error || new Error('Failed to delete from IndexedDB'));
            };
        });
    } catch (err) {
        console.warn('[Offline DB] IndexedDB delete failed, using fallback:', err);
        const queue = getLocalStorageQueue();
        const filtered = queue.filter(item => item.id !== id);
        saveLocalStorageQueue(filtered);
    }
}

/**
 * Checks if there are pending offline sales in queue
 */
export async function hasOfflineSales(): Promise<boolean> {
    const list = await getOfflineSales();
    return list.length > 0;
}
