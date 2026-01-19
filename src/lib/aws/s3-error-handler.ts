import { S3ServiceException } from '@aws-sdk/client-s3';

/**
 * S3エラーを適切なHTTPステータスコードとメッセージに変換
 */
export function handleS3Error(error: unknown): { message: string; statusCode: number } {
  if (error instanceof S3ServiceException) {
    switch (error.name) {
      case 'NoSuchBucket':
        return { message: 'S3 bucket not found', statusCode: 404 };
      case 'AccessDenied':
        return { message: 'Access denied to S3 bucket', statusCode: 403 };
      case 'InvalidAccessKeyId':
        return { message: 'Invalid AWS credentials', statusCode: 401 };
      case 'NetworkError':
        return { message: 'Network error connecting to S3', statusCode: 503 };
      default:
        return { message: `S3 error: ${error.message}`, statusCode: 500 };
    }
  }

  return { message: 'Unknown error occurred', statusCode: 500 };
}
