import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { FilesRepository } from './files.repository';
import { FileMetadata } from './interfaces/file-metadata.interface';
import { UploadFileResponseDto } from './dto/upload-file.response';
import { sanitizeFilename } from './utils/sanitize-filename.util';

@Injectable()
export class FilesService {
  private readonly maxUploadMB: number;
  private readonly allowedMimeTypes: string[];
  private readonly uploadsDir: string;

  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly configService: ConfigService,
  ) {
    this.maxUploadMB = parseInt(this.configService.get<string>('MAX_UPLOAD_MB', '25'));
    this.allowedMimeTypes = this.configService
      .get<string>('ALLOWED_MIME_LIST', 'image/png,image/jpeg,application/pdf')
      .split(',')
      .map(mime => mime.trim().toLowerCase());
    this.uploadsDir = this.configService.get<string>('UPLOADS_DIR', './uploads');
  }

  /**
   * Upload file with validations and metadata storage
   */
  async uploadFile(file: Express.Multer.File): Promise<UploadFileResponseDto> {
    // Validate file size
    const maxBytes = this.maxUploadMB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File size exceeds limit of ${this.maxUploadMB}MB. Received: ${Math.round(file.size / 1024 / 1024 * 100) / 100}MB`
      );
    }

    // Validate MIME type (case-insensitive, ignore parameters)
    const fileMimeType = file.mimetype.toLowerCase().split(';')[0].trim();
    if (!this.allowedMimeTypes.includes(fileMimeType)) {
      throw new BadRequestException(
        `MIME type '${file.mimetype}' not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`
      );
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.originalname);
    
    // Generate file path with date structure
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const fileId = randomUUID();
    
    const ownerId = 'demo-user'; // Hard-coded for MVP
    const relativePath = join(ownerId, String(year), month, day);
    const filename = `${fileId}-${sanitizedFilename}`;
    const fullPath = join(this.uploadsDir, relativePath, filename);

    // Ensure directory exists
    await fs.mkdir(join(this.uploadsDir, relativePath), { recursive: true });

    // Move file to final location
    await fs.writeFile(fullPath, file.buffer);

    // Create metadata
    const metadata: FileMetadata = {
      id: fileId,
      ownerId,
      filename: sanitizedFilename,
      sizeBytes: file.size,
      mimeType: file.mimetype,
      path: fullPath,
      createdAt: now.toISOString(),
    };

    // Save metadata
    await this.filesRepository.add(metadata);

    // Return response DTO
    return {
      id: metadata.id,
      filename: metadata.filename,
      sizeBytes: metadata.sizeBytes,
      mimeType: metadata.mimeType,
      createdAt: metadata.createdAt,
    };
  }

  /**
   * Get files for demo user
   */
  async getFiles(): Promise<FileMetadata[]> {
    return this.filesRepository.findByOwner('demo-user');
  }

  /**
   * Get file by ID for download
   */
  async getFileById(id: string): Promise<FileMetadata> {
    const file = await this.filesRepository.findById(id);
    if (!file) {
      throw new NotFoundException(`File with ID '${id}' not found`);
    }

    // Verify file exists on disk
    try {
      await fs.access(file.path);
    } catch {
      throw new NotFoundException(`File '${id}' not found on disk`);
    }

    return file;
  }

  /**
   * Delete file by ID
   */
  async deleteFile(id: string): Promise<void> {
    const file = await this.filesRepository.findById(id);
    if (!file) {
      throw new NotFoundException(`File with ID '${id}' not found`);
    }

    // Remove from disk
    try {
      await fs.unlink(file.path);
    } catch {
      // File might already be deleted from disk, continue with metadata removal
    }

    // Remove from metadata
    const removed = await this.filesRepository.remove(id);
    if (!removed) {
      throw new NotFoundException(`File with ID '${id}' not found in metadata`);
    }
  }
}
