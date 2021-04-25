import { connect } from 'socket.io-client';
import { ClientEmitEvent } from 'Shared/socket';
import * as dotenv from 'dotenv';
import { getClientId } from './util';

dotenv.config();

interface ClientEnv {
  REACT_APP_SOCKET_IP: string;
  REACT_APP_SOCKET_PORT: string;
  CLIENT_ID: string;
}
const {
  REACT_APP_SOCKET_IP,
  REACT_APP_SOCKET_PORT,
} = process.env as unknown as ClientEnv;

let socketInstance: SocketIOClient.Socket | undefined;
/**
 * Gets the socket instance for the client.
 * @returns Socket instance.
 */
const getSocket = (): SocketIOClient.Socket => {
  if(!socketInstance) {
    socketInstance = connect(`http://${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}/server`);
  }
  return socketInstance;
}
/**
 * Get a new SocketIOClient Socket for a microcontroller.
 * @returns a new SocketIO Client instance.
 */
const getMicroSocketInstance = (): SocketIOClient.Socket => {
  return connect(`http://${REACT_APP_SOCKET_IP}:${REACT_APP_SOCKET_PORT}/server`, {
      forceNew: true,
    });
}

const socket = getSocket();
const { INIT_LIGHT_CLIENT } = ClientEmitEvent;
socket.on('connect', () => {
  socket.emit(INIT_LIGHT_CLIENT, getClientId());
});

export default getSocket;
export {
  getMicroSocketInstance
}
