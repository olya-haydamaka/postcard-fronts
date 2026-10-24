/**
 * The work in progress, kept in this browser's IndexedDB so a reload or a closed tab loses nothing: every card's
 * record (title, number, placement) and its picture, the original file byte for byte, so an export after a reload
 * equals one before it. localStorage could not hold pictures (about 5 MB in all). Nothing leaves the computer;
 * «Clear list» empties it.
 */

const DB_NAME = 'haydamaka-postcard';
const CARDS = 'cards';
const FILES = 'files';

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CARDS);
      req.result.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
  // A failed open (storage blocked) is retried next time instead of failing for the rest of the page's life.
  opening.catch(() => (opening = null));
  return opening;
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/**
 * Stores the list as it is now, in one transaction: every card's record, the pictures in `files` (new or replaced
 * ones; the others are stored already), and nothing left of cards no longer on the list.
 */
export async function writeCards<T extends { id: number }>(records: T[], files: Map<number, File>): Promise<void> {
  const tx = (await db()).transaction([CARDS, FILES], 'readwrite');
  const cards = tx.objectStore(CARDS);
  const pictures = tx.objectStore(FILES);
  cards.clear();
  for (const r of records) cards.put(r, r.id);
  for (const [id, file] of files) pictures.put(file, id);
  const keep = new Set(records.map((r) => r.id));
  const keys = pictures.getAllKeys();
  keys.onsuccess = () => {
    for (const k of keys.result) if (!keep.has(k as number)) pictures.delete(k);
  };
  await done(tx);
}

/**
 * Every stored card with its picture, in no particular order; a record whose picture is missing is left out. Browsers
 * give a stored File back as a File, but only a Blob is promised.
 */
export async function readCards(): Promise<{ record: unknown; file: Blob }[]> {
  const tx = (await db()).transaction([CARDS, FILES], 'readonly');
  const records = tx.objectStore(CARDS).getAll();
  const keys = tx.objectStore(CARDS).getAllKeys();
  const files = tx.objectStore(FILES).getAll();
  const fileKeys = tx.objectStore(FILES).getAllKeys();
  await done(tx);
  const byId = new Map(fileKeys.result.map((k, i) => [k, files.result[i] as unknown]));
  return records.result.flatMap((record, i) => {
    const file = byId.get(keys.result[i]);
    return file instanceof Blob ? [{ record: record as unknown, file }] : [];
  });
}
