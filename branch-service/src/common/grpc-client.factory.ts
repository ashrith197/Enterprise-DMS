import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

export function createGrpcClient(
  protoFileName: string,
  serviceName: string,
  serverUrl: string,
) {
  const protoPath = join(__dirname, '../../proto', protoFileName);

  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  const packageName = protoFileName.replace('.proto', '');
  const serviceConstructor = (protoDescriptor[packageName] as any)[serviceName];

  return new serviceConstructor(serverUrl, grpc.credentials.createInsecure());
}
