import { scan } from './serial';
import { getClientId } from './util';
import { ClientEmitEvent } from 'Shared/socket'
import getSocket from './socket';
import initBluez, { getRfcommDetails, spawnRfcomm, getVisibleDevices } from './bluetooth';
import log from 'Shared/logger';
import { AllBTInfoPayload, DevicePropsPayload, RfcommPayload } from 'Shared/types/client';

const socket = getSocket();
export default class SocketClient {
  private id: number;
  private scanPort: NodeJS.Timeout;
  
  constructor() {
    this.initBluez();
    this.initSocket();
    this.id = getClientId();
    this.scanPort = this.initSerial();
    this.getRfcommDetails();
  }
  private getRfcommDetails = async (): Promise<void> => {
    const details = await getRfcommDetails();
    const payload: RfcommPayload = {
      clientId: this.id,
      rfcomms: details,
    }
    socket.emit(ClientEmitEvent.BT_CONNECTED_DEVS, payload);
  }
  private getVisibleDevices = async (): Promise<void> => {
    const devices = await getVisibleDevices();
    const payload: DevicePropsPayload = {
      clientId: this.id,
      devices,
    }
    socket.emit(ClientEmitEvent.BT_VISIBLE_DEVS, payload);
  }
  private getAllBTInfo = async (): Promise<void> => {
    const [rfcomms, devices] = await Promise.all([getRfcommDetails(), getVisibleDevices()]);
    const payload: AllBTInfoPayload = {
      clientId: this.id,
      rfcomms,
      devices,
    }
    socket.emit(ClientEmitEvent.BT_ALL_DEV_INFO, payload);
  }
  private createRfcomm = (address: string) => {
    spawnRfcomm(address);
  }
  private initBluez = (): void => {
    initBluez();
  }
  private initSerial = (): NodeJS.Timeout => {
    if(this.scanPort) clearInterval(this.scanPort);
    this.scanPort = setInterval(scan, 3000);
    return setInterval(scan, 3000);
  }
  private initSocket = (): void => {
    socket.emit(ClientEmitEvent.INIT_LIGHT_CLIENT, this.id);
  }
}