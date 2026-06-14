import Dexie, { type Table } from 'dexie';
import { STATE_RECORD_ID } from '../config';
import type { AppState } from '../types';

type StateRecord = {
  id: string;
  value: AppState;
  updatedAt: string;
};

class GymLocalDatabase extends Dexie {
  state!: Table<StateRecord, string>;

  constructor() {
    super('gym-local-db');

    this.version(1).stores({
      state: 'id'
    });
  }
}

const db = new GymLocalDatabase();

export const loadAppState = async (): Promise<AppState | null> => {
  const record = await db.state.get(STATE_RECORD_ID);

  return record?.value ?? null;
};

export const saveAppState = async (value: AppState): Promise<void> => {
  await db.state.put({
    id: STATE_RECORD_ID,
    value,
    updatedAt: new Date().toISOString()
  });
};

export const clearAppState = async (): Promise<void> => {
  await db.state.clear();
};