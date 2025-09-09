import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from '../../src/upload/upload.service';
import { BlockBlobClient } from '@azure/storage-blob';

// Mock the Azure Storage SDK
jest.mock('@azure/storage-blob', () => {
  const mockSasUrl = 'https://mockaccount.blob.core.windows.net/mockcontainer/mockblob?se=2025-09-09T12%3A00%3A00Z&sp=cw&spr=https&sr=b&sig=mockSignature&sv=2023-01-03';
  const mockUrl = 'https://mockaccount.blob.core.windows.net/mockcontainer/mockblob';
  
  class MockBlockBlobClient {
    url = mockUrl;
    async generateSasUrl() {
      return mockSasUrl;
    }
  }
  
  class MockContainerClient {
    getBlockBlobClient() {
      return new MockBlockBlobClient();
    }
  }
  
  class MockBlobServiceClient {
    getContainerClient() {
      return new MockContainerClient();
    }
  }
  
  return {
    BlobServiceClient: MockBlobServiceClient,
    BlockBlobClient: MockBlockBlobClient,
    StorageSharedKeyCredential: jest.fn(),
    BlobSASPermissions: {
      parse: jest.fn(),
    },
  };
});

describe('UploadService', () => {
  let service: UploadService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const configs: Record<string, any> = {
        AZURE_STORAGE_ACCOUNT: 'testaccount',
        AZURE_STORAGE_ACCOUNT_KEY: 'testkey',
        AZURE_STORAGE_CONTAINER: 'testcontainer',
        ALLOWED_MIME_LIST: 'image/png,image/jpeg,application/pdf',
        MAX_UPLOAD_MB: 25,
        AZURE_SAS_TTL: '5m'
      };
      return configs[key] !== undefined ? configs[key] : defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueUploadSAS', () => {
    const userId = 'test-user-123';
    const filename = 'test-file.jpg';
    const validMimeType = 'image/jpeg';
    const invalidMimeType = 'application/exe';
    const validSize = 5 * 1024 * 1024; // 5MB
    const invalidSize = 50 * 1024 * 1024; // 50MB

    it('should return a valid SAS URL for valid inputs', async () => {
      // Mock logger to test telemetry
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      
      const result = await service.issueUploadSAS(userId, filename, validMimeType, validSize);
      
      expect(result.uploadUrl).toBeDefined();
      expect(result.blobPath).toContain(`u/${userId}`);
      expect(result.expiresAt).toBeDefined();
      
      // Check required headers are present (exact case)
      expect(result.requiredHeaders).toContainEqual({
        name: 'x-ms-blob-type',
        value: 'BlockBlob',
      });
      
      // Verify telemetry logging
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sas_upload_issued',
          userId,
          mimeType: validMimeType,
          sizeBytes: validSize,
          blobPath: expect.stringContaining(`u/${userId}`),
          expiresAt: expect.any(String),
        })
      );
    });

    it('should throw BadRequestException for invalid MIME type', async () => {
      await expect(
        service.issueUploadSAS(userId, filename, invalidMimeType, validSize)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for exceeding size limit', async () => {
      await expect(
        service.issueUploadSAS(userId, filename, validMimeType, invalidSize)
      ).rejects.toThrow(BadRequestException);
    });
    
    it('should throw BadRequestException for zero or negative size', async () => {
      await expect(
        service.issueUploadSAS(userId, filename, validMimeType, 0)
      ).rejects.toThrow('El tamaño del archivo debe ser mayor a 0');
      
      await expect(
        service.issueUploadSAS(userId, filename, validMimeType, -100)
      ).rejects.toThrow('El tamaño del archivo debe ser mayor a 0');
    });

    it('should create a namespaced blobPath with correct pattern', async () => {
      const result = await service.issueUploadSAS(userId, filename, validMimeType, validSize);
      
      // Check namespace structure: u/<userId>/YYYY/MM/DD/<uuid>-filename
      expect(result.blobPath).toMatch(new RegExp(`^u/${userId}/\\d{4}/\\d{2}/\\d{2}/[\\w-]+-test-file\\.jpg$`));
    });
    
    it('should handle MIME types case-insensitively', async () => {
      // Test uppercase MIME type
      const result = await service.issueUploadSAS(userId, filename, 'IMAGE/JPEG', validSize);
      expect(result.uploadUrl).toBeDefined();
    });
    
    it('should handle MIME types with parameters', async () => {
      // Test MIME type with charset parameter
      const result = await service.issueUploadSAS(userId, filename, 'image/jpeg; charset=utf-8', validSize);
      expect(result.uploadUrl).toBeDefined();
    });
    
    it('should verify TTL window (expiresAt within expected range)', async () => {
      const beforeCall = new Date();
      const result = await service.issueUploadSAS(userId, filename, validMimeType, validSize);
      const afterCall = new Date();
      
      const expiresAt = new Date(result.expiresAt);
      const expectedMinExpiry = new Date(beforeCall.getTime() + 4.5 * 60 * 1000); // 4.5 minutes
      const expectedMaxExpiry = new Date(afterCall.getTime() + 5.5 * 60 * 1000); // 5.5 minutes
      
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiry.getTime());
    });
    
    it('should only include x-ms-blob-type header (not Content-Type)', async () => {
      const result = await service.issueUploadSAS(userId, filename, validMimeType, validSize);
      
      expect(result.requiredHeaders).toHaveLength(1);
      expect(result.requiredHeaders[0]).toEqual({
        name: 'x-ms-blob-type',
        value: 'BlockBlob',
      });
    });
    
    it('should handle extreme filenames safely', async () => {
      // Test very long filename
      const longFilename = 'a'.repeat(200) + '.jpg';
      const result1 = await service.issueUploadSAS(userId, longFilename, validMimeType, validSize);
      expect(result1.blobPath).toBeDefined();
      
      // Test filename with special characters and path traversal
      const evilFilename = '../../../evil.jpg';
      const result2 = await service.issueUploadSAS(userId, evilFilename, validMimeType, validSize);
      expect(result2.blobPath).not.toContain('..');
      
      // Test filename with emojis/accents
      const unicodeFilename = 'archivo_con_émojis_🚀.jpg';
      const result3 = await service.issueUploadSAS(userId, unicodeFilename, validMimeType, validSize);
      expect(result3.blobPath).toBeDefined();
    });
  });
});
