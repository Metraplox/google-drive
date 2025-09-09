import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { FileMetadata } from './interfaces/file-metadata.interface';

@Injectable()
export class FilesRepository {
  private readonly dataFile: string;
  private cache: FileMetadata[] | null = null;

  constructor(private readonly configService: ConfigService) {
    const dataDir = this.configService.get<string>('DATA_DIR', './.data');
    this.dataFile = join(dataDir, 'files.json');
  }

  /**
   * Load files from JSON file (lazy loading with cache)
   */
  private async loadFiles(): Promise<FileMetadata[]> {
    if (this.cache !== null) {
      return this.cache;
    }

    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      this.cache = JSON.parse(data) as FileMetadata[];
      return this.cache;
    } catch (error) {
      // File doesn't exist yet, create empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = [];
        await this.saveFiles();
        return this.cache;
      }
      throw error;
    }
  }

  /**
   * Save files to JSON file (atomic write)
   */
  private async saveFiles(): Promise<void> {
    if (this.cache === null) {
      throw new Error('Cache not initialized');
    }

    // Ensure data directory exists
    const dataDir = this.configService.get<string>('DATA_DIR', './.data');
    await fs.mkdir(dataDir, { recursive: true });

    // Atomic write
    const tempFile = this.dataFile + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(this.cache, null, 2), 'utf-8');
    await fs.rename(tempFile, this.dataFile);
  }

  /**
   * Add new file metadata
   */
  async add(file: FileMetadata): Promise<void> {
    const files = await this.loadFiles();
    files.push(file);
    await this.saveFiles();
  }

  /**
   * Find files by owner ID
   */
  async findByOwner(ownerId: string): Promise<FileMetadata[]> {
    const files = await this.loadFiles();
    return files.filter(file => file.ownerId === ownerId);
  }

  /**
   * Find file by ID
   */
  async findById(id: string): Promise<FileMetadata | null> {
    const files = await this.loadFiles();
    return files.find(file => file.id === id) || null;
  }

  /**
   * Remove file by ID
   */
  async remove(id: string): Promise<boolean> {
    const files = await this.loadFiles();
    const initialLength = files.length;
    this.cache = files.filter(file => file.id !== id);
    
    if (this.cache.length < initialLength) {
      await this.saveFiles();
      return true;
    }
    return false;
  }
}
