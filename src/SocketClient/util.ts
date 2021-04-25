
import {existsSync, writeFileSync, readFileSync} from 'fs';
import { generateId } from 'Shared/store';

interface ClientInfo {
  clientId: number | undefined;
}

export function getClientId(): number {
  const clientInfoPath = './gen/clientInfo.json';
  let clientId: number;
  const writeClientInfo = (clientInfo: ClientInfo, path: string): void => writeFileSync(path, JSON.stringify(clientInfo, null, '  '));
  if(existsSync(clientInfoPath)) {
    const clientInfo: ClientInfo = JSON.parse(readFileSync(clientInfoPath, 'utf8'));
    if (clientInfo.clientId) {
      clientId = clientInfo.clientId
    } else {
      clientId = generateId();
      writeClientInfo({clientId}, clientInfoPath);
    }
  } else {
    clientId = generateId();
    writeClientInfo({clientId}, clientInfoPath);
  }
  return clientId;
}