import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FilesService } from './files.service';
import { UploadFileResponseDto } from './dto/upload-file.response';
import { FileMetadata } from './interfaces/file-metadata.interface';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * POST /files - Upload file (multipart, field 'file')
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: null, // Use memory storage for validation before saving
    })
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File
  ): Promise<UploadFileResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided. Use field name "file"');
    }

    return this.filesService.uploadFile(file);
  }

  /**
   * GET /files - List files for demo user
   */
  @Get()
  async getFiles(): Promise<FileMetadata[]> {
    return this.filesService.getFiles();
  }

  /**
   * GET /files/:id - Download file by ID
   */
  @Get(':id')
  async downloadFile(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = await this.filesService.getFileById(id);
    
    // Set headers for download
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', file.sizeBytes);
    
    // Stream file
    res.download(file.path, file.filename);
  }

  /**
   * DELETE /files/:id - Delete file by ID (optional endpoint)
   */
  @Delete(':id')
  async deleteFile(@Param('id') id: string): Promise<{ message: string }> {
    await this.filesService.deleteFile(id);
    return { message: `File '${id}' deleted successfully` };
  }
}
