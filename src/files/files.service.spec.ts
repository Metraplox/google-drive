import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesRepository } from './files.repository';
import { promises as fs } from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
  },
}));

describe('FilesService', () => {
  let service: FilesService;
  let repository: FilesRepository;
  let configService: ConfigService;

  // Mock file object
  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test image.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 1024 * 1024, // 1MB
    destination: '',
    filename: '',
    path: '',
    buffer: Buffer.from('fake image data'),
    stream: null as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: FilesRepository,
          useValue: {
            add: jest.fn(),
            findByOwner: jest.fn(),
            findById: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                MAX_UPLOAD_MB: '25',
                ALLOWED_MIME_LIST: 'image/png,image/jpeg,application/pdf',
                UPLOADS_DIR: './uploads',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    repository = module.get<FilesRepository>(FilesRepository);
    configService = module.get<ConfigService>(ConfigService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload a valid file successfully', async () => {
      const mockAdd = jest.spyOn(repository, 'add').mockResolvedValue();
      const mockMkdir = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      const mockWriteFile = jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const result = await service.uploadFile(mockFile);

      expect(result).toMatchObject({
        filename: 'test_image.png',
        sizeBytes: 1024 * 1024,
        mimeType: 'image/png',
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'demo-user',
          filename: 'test_image.png',
          sizeBytes: 1024 * 1024,
          mimeType: 'image/png',
        })
      );
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid MIME type', async () => {
      const invalidFile = { ...mockFile, mimetype: 'application/exe' };

      await expect(service.uploadFile(invalidFile)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.uploadFile(invalidFile)).rejects.toThrow(
        'MIME type \'application/exe\' not allowed'
      );
    });

    it('should throw BadRequestException for file size exceeding limit', async () => {
      const largeFile = { ...mockFile, size: 26 * 1024 * 1024 }; // 26MB

      await expect(service.uploadFile(largeFile)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.uploadFile(largeFile)).rejects.toThrow(
        'File size exceeds limit of 25MB'
      );
    });

    it('should fall back to default limit when MAX_UPLOAD_MB is invalid', async () => {
      const invalidConfigService = {
        get: jest.fn((key: string, defaultValue?: string) => {
          if (key === 'MAX_UPLOAD_MB') {
            return 'not-a-number';
          }
          if (key === 'ALLOWED_MIME_LIST') {
            return 'image/png,image/jpeg,application/pdf';
          }
          if (key === 'UPLOADS_DIR') {
            return './uploads';
          }
          return defaultValue as string;
        }),
      } as unknown as ConfigService;

      const serviceWithInvalidConfig = new FilesService(repository, invalidConfigService);
      const largeFile = { ...mockFile, size: 26 * 1024 * 1024 }; // 26MB

      await expect(serviceWithInvalidConfig.uploadFile(largeFile)).rejects.toThrow(
        BadRequestException
      );
      await expect(serviceWithInvalidConfig.uploadFile(largeFile)).rejects.toThrow(
        'File size exceeds limit of 25MB'
      );
    });

    it('should handle MIME types case-insensitively', async () => {
      const mockAdd = jest.spyOn(repository, 'add').mockResolvedValue();
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const upperCaseFile = { ...mockFile, mimetype: 'IMAGE/PNG' };
      
      const result = await service.uploadFile(upperCaseFile);
      
      expect(result).toBeDefined();
      expect(mockAdd).toHaveBeenCalled();
    });

    it('should handle MIME types with parameters', async () => {
      const mockAdd = jest.spyOn(repository, 'add').mockResolvedValue();
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const mimeWithParams = { ...mockFile, mimetype: 'image/png; charset=binary' };
      
      const result = await service.uploadFile(mimeWithParams);
      
      expect(result).toBeDefined();
      expect(mockAdd).toHaveBeenCalled();
    });

    it('should sanitize extreme filenames safely', async () => {
      const mockAdd = jest.spyOn(repository, 'add').mockResolvedValue();
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const extremeFile = { 
        ...mockFile, 
        originalname: '../../../etc/passwd<>:"|?*\x00\x1f very long filename that exceeds reasonable limits and should be truncated properly.png'
      };
      
      const result = await service.uploadFile(extremeFile);
      
      expect(result.filename).not.toContain('../');
      expect(result.filename).not.toContain('<');
      expect(result.filename).not.toContain('\x00');
      expect(result.filename.length).toBeLessThanOrEqual(120);
      expect(mockAdd).toHaveBeenCalled();
    });
  });

  describe('getFiles', () => {
    it('should return files for demo user', async () => {
      const mockFiles = [
        {
          id: '123',
          ownerId: 'demo-user',
          filename: 'test.png',
          sizeBytes: 1024,
          mimeType: 'image/png',
          path: '/uploads/demo-user/2025/09/09/123-test.png',
          createdAt: '2025-09-09T00:00:00.000Z',
        },
      ];

      jest.spyOn(repository, 'findByOwner').mockResolvedValue(mockFiles);

      const result = await service.getFiles();

      expect(result).toEqual(mockFiles);
      expect(repository.findByOwner).toHaveBeenCalledWith('demo-user');
    });
  });

  describe('getFileById', () => {
    it('should return file when found and exists on disk', async () => {
      const mockFile = {
        id: '123',
        ownerId: 'demo-user',
        filename: 'test.png',
        sizeBytes: 1024,
        mimeType: 'image/png',
        path: '/uploads/demo-user/2025/09/09/123-test.png',
        createdAt: '2025-09-09T00:00:00.000Z',
      };

      jest.spyOn(repository, 'findById').mockResolvedValue(mockFile);
      jest.spyOn(fs, 'access').mockResolvedValue();

      const result = await service.getFileById('123');

      expect(result).toEqual(mockFile);
      expect(fs.access).toHaveBeenCalledWith(mockFile.path);
    });

    it('should throw NotFoundException when file not found in metadata', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(null);

      await expect(service.getFileById('nonexistent')).rejects.toThrow(
        NotFoundException
      );
      await expect(service.getFileById('nonexistent')).rejects.toThrow(
        'File with ID \'nonexistent\' not found'
      );
    });

    it('should throw NotFoundException when file not found on disk', async () => {
      const mockFile = {
        id: '123',
        ownerId: 'demo-user',
        filename: 'test.png',
        sizeBytes: 1024,
        mimeType: 'image/png',
        path: '/uploads/demo-user/2025/09/09/123-test.png',
        createdAt: '2025-09-09T00:00:00.000Z',
      };

      jest.spyOn(repository, 'findById').mockResolvedValue(mockFile);
      jest.spyOn(fs, 'access').mockRejectedValue(new Error('File not found'));

      await expect(service.getFileById('123')).rejects.toThrow(
        NotFoundException
      );
      await expect(service.getFileById('123')).rejects.toThrow(
        'File \'123\' not found on disk'
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const mockFile = {
        id: '123',
        ownerId: 'demo-user',
        filename: 'test.png',
        sizeBytes: 1024,
        mimeType: 'image/png',
        path: '/uploads/demo-user/2025/09/09/123-test.png',
        createdAt: '2025-09-09T00:00:00.000Z',
      };

      jest.spyOn(repository, 'findById').mockResolvedValue(mockFile);
      jest.spyOn(fs, 'unlink').mockResolvedValue();
      jest.spyOn(repository, 'remove').mockResolvedValue(true);

      await service.deleteFile('123');

      expect(fs.unlink).toHaveBeenCalledWith(mockFile.path);
      expect(repository.remove).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundException when file not found', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(null);

      await expect(service.deleteFile('nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
