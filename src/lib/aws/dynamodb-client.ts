import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Document Client のシングルトンインスタンス
 *
 * Vercel のサーバーレス環境でも、同一プロセス内ではクライアントを再利用する。
 * 環境変数に AWS 認証情報が設定されている場合はそれを使用し、
 * 設定されていない場合は IAM ロール (EC2/Lambda) または環境のデフォルト認証を使用する。
 */
const getClient = (): DynamoDBDocumentClient => {
  const config: {
    region: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  } = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };

  // 明示的に認証情報が設定されている場合のみ使用
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  const client = new DynamoDBClient(config);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
};

export const dynamoClient = getClient();
