import {connect} from 'socket.io-client';
import { AnyAction } from 'redux';
import {
  ClientEmitEvent, SharedEmitEvent,
} from '../Shared/socket';
import { MicroState } from 'Shared/store';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
interface ClientEnv {
  REACT_APP_SOCKET_IP: string;
  REACT_APP_SOCKET_PORT: string;
  CLIENT_ID: string;
}
const {
  REACT_APP_SOCKET_IP,
  REACT_APP_SOCKET_PORT,
  CLIENT_ID
} = process.env as unknown as ClientEnv;
export let socketInstance: SocketIOClient.Socket | undefined;
const getSocket = (): SocketIOClient.Socket => {
  if(!socketInstance) {
    socketInstance = connect(`http://${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}/server`);
  }
  return socketInstance;
}
const getMicroSocketInstance = (): SocketIOClient.Socket => {
  return connect(`http://${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}/server`, {
      forceNew: true,
    });
}
const socket = getSocket();
const {INIT_LIGHT_CLIENT, ADD_MICRO_CHANNEL} = ClientEmitEvent;
socket.on('connect', () => {
  socket.emit(INIT_LIGHT_CLIENT, CLIENT_ID);
});
export function addMicroChannel(microId: MicroState['microId']): void {
  socket.emit(ADD_MICRO_CHANNEL, String(microId));
}
const { ROOT_ACTION } = SharedEmitEvent;
export function emitAnyAction(action: AnyAction): void {
  socket.emit(ROOT_ACTION, action);
}
export default getSocket;
export {
  getMicroSocketInstance
}
