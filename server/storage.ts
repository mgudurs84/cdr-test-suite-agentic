// Storage interface for FHIR test case data
// Currently using in-memory storage as per development guidelines

export interface IStorage {
  // Storage methods can be added here if needed for persistent data
}

export class MemStorage implements IStorage {
  constructor() {
    // In-memory storage for any future data needs
  }
}

export const storage = new MemStorage();
