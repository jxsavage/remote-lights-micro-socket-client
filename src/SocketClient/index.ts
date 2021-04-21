import { SharedEmitEvent } from 'Shared/socket';
import getSocket from './socket';
import { scan } from './serial';
import log from 'Shared/logger';

const socket = getSocket();
export default function initClient(clientId: number): void {
  setInterval(scan, 3000);
  
  const { RE_INIT_APP_STATE } = SharedEmitEvent;
  socket.on(RE_INIT_APP_STATE, () => {
    log('bgRed', 'Need to impliment RE_INIT_APP_STATE');
  });
}