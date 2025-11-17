import { FileStorage } from '../clients/s3.client.js';

export class StorageService {

  static getSessionStorage(): FileStorage {
    return new FileStorage('auth_info');
  }

  static getAppStorage(): FileStorage {
    return new FileStorage('app-data');
  }
}

