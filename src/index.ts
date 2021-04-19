import initClient from './SocketClient';
import log from './Shared/logger';
import {existsSync, writeFileSync, readFileSync} from 'fs';
import { generateId } from './Shared/store/utils';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
interface LaunchEnv {
  REACT_APP_SOCKET_IP: string;
  REACT_APP_SOCKET_PORT: string;
}
const {
  REACT_APP_SOCKET_IP,
  REACT_APP_SOCKET_PORT
} = process.env as unknown as LaunchEnv;

interface ClientInfo {
  clientId: number | undefined;
}
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

log('infoHeader', `Launching Pi in client only mode, looking for server @${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}`)
initClient(clientId);