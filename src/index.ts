import SocketClient from 'SocketClient';
import log from 'Shared/logger';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config();
interface LaunchEnv {
  NODE_ENV: string;
  REACT_APP_SOCKET_IP: string;
  REACT_APP_SOCKET_PORT: string;
  DISABLE_BT: 'true' | 'false';
}
const {
  NODE_ENV,
} = process.env as unknown as LaunchEnv;

let nodeEnv: string;
if(NODE_ENV === 'development' || NODE_ENV === 'production') {
  nodeEnv = NODE_ENV
} else {
  nodeEnv = 'development';
}
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${nodeEnv}`),
})
const {
  REACT_APP_SOCKET_IP,
  REACT_APP_SOCKET_PORT,
  DISABLE_BT,
} = process.env as unknown as LaunchEnv;
const disableBt = DISABLE_BT ? 'false' : DISABLE_BT;
log('infoHeader', `Launching Pi in client only mode, looking for server @${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}`)
const client = new SocketClient(disableBt);