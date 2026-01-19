/**
 * リトライロジックの実装
 * ネットワークエラーや一時的なS3エラーに対して指数バックオフでリトライ
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // リトライ不可能なエラー（認証エラーなど）は即座にスロー
      if (error.name === 'AccessDenied' || error.name === 'InvalidAccessKeyId') {
        throw error;
      }

      // 指数バックオフでリトライ
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError!;
}
