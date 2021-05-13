import SocketClient from 'SocketClient';
import log from 'Shared/logger';
import 'SocketClient/bluetooth'
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


log('infoHeader', `Launching Pi in client only mode, looking for server @${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}`)
const client = new SocketClient();