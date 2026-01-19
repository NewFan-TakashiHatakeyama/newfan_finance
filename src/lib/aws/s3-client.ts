import { S3Client } from '@aws-sdk/client-s3';

/**
 * S3クライアントの初期化
 * 
 * 認証情報の優先順位:
 * 1. 環境変数（AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY）- Vercel/ローカル開発用
 * 2. IAMロール（Lambda/EC2で実行する場合）- 自動的に取得される
 */
const getS3Client = (): S3Client => {
  const config: {
    region: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  } = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };

  // 環境変数から認証情報を取得（Vercel/ローカル開発環境用）
  // IAMロールを使用する場合（Lambda等）、認証情報は自動的に取得されるため不要
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new S3Client(config);
};

export const s3Client = getS3Client();
