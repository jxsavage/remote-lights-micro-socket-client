import {  scanSerial, initSerialPort, SerialWithParser } from './serial';
import { getClientId } from './util';
import { ClientEmitEvent } from 'Shared/socket'
import getSocket, { getMicroSocketInstance } from './socket';
import Bluetooth from './bluetooth';
import log from 'Shared/logger';
import {
  AllBTInfoPayload, DevicePropsPayload, RfcommPayload,
} from 'Shared/types/client';
import Microcontroller from 'Microcontroller';

const socket = getSocket();
export default class SocketClient {
  private id: number;
  private bluetooth!: Bluetooth;
  private scanPort: NodeJS.Timeout;
  private portsInUse: Set<string>;
  private microMap: Map<Microcontroller, Microcontroller>;
  
  constructor(disableBT: ('true' | 'false')) {
    this.microMap = new Map<Microcontroller, Microcontroller>();
    this.portsInUse = new Set<string>();
    if (disableBT === 'false') {
      log('textGreen', 'Bluetooth enabled.');
      this.bluetooth = new Bluetooth();
      this.initBluez();
      this.getRfcommDetails();
    } else {
      log('bgRed', ' Bluetooth [ DISABLED ] ');
    }
    this.initSocket();
    this.id = getClientId();
    this.scanPort = this.initSerial();
    
  }
  private portInUse = (portPath: string): boolean => this.portsInUse.has(portPath);
  private addPortPathToSet = (path: string) => this.portsInUse.add(path);
  private removePortPathFromSet = (path: string): boolean => {
    const deleted: boolean = this.portsInUse.delete(path);
    if(deleted) {
      log('textGreen', `[ ${path} ] Successfully removed device from set.`)
    } else {
      log('textRed', ` [ ${path} ] Tried to remove device path that did not exist in set.`)
    }
    return deleted;
  }
  private deleteMicro(micro: Microcontroller) {
    const {serial: {port: {path}}, microId} = micro;
    const regex = /rfcomm([0-9]+)/;
    const results = regex.exec(path);
    if(results != null) {
      const [,device] = results;
      this.releaseRfcomm(Number(device));
    }
    this.microMap.get(micro)?.clean();
    this.removePortPathFromSet(path);
    if(this.microMap.delete(micro)) {
      log('textGreen', ` [ Micro: ${microId} ] Successfully deleted. `);
    } else {
      log('textRed', ` [ Micro: ${microId} ] Attempted to delete non-existant mico from map. `);
    }
  }
  private releaseIfRfcomm = (path: string) => {
    const regex = /rfcomm([0-9]+)/;
    const results = regex.exec(path);
    if(results != null) {
      const [,device] = results;
      this.releaseRfcomm(Number(device));
    }
  }
  private scanNewMicros = async (): Promise<void> => {
    const portInfoArray = await scanSerial();
    const newPorts = portInfoArray.filter(({path}) => !this.portInUse(path));
    newPorts.forEach(async (portInfo) => {
      let port: SerialWithParser | null = null;
      try {
        this.addPortPathToSet(portInfo.path);
        port = await initSerialPort(portInfo);
        const initializingMicro = new Microcontroller(port, getMicroSocketInstance());
        this.microMap.set(initializingMicro, initializingMicro);
        initializingMicro.serial.port.on('close', () => {
          this.microMap.get(initializingMicro)?.microId
          log('bgRed', `Connection to microcontroller ${this.microMap.get(initializingMicro)?.microId} closed. Removing microcontroller instance...`);
          this.deleteMicro(initializingMicro);
        });
        try {
          await initializingMicro.initialize();
        } catch {
          log('bgRed', ` Microcontroller @ ${initializingMicro.serial.port.path} failed to initialize! `);
          this.deleteMicro(initializingMicro);
        }
      } catch {
        log('bgRed', ` [ ${portInfo.path} ] Failed to initialize. `);
        this.removePortPathFromSet(portInfo.path);
        this.releaseIfRfcomm(portInfo.path);
      }
    });
  }
  private getRfcommDetails = async (): Promise<void> => {
    const details = await this.bluetooth.getRfcommDetails();
    const payload: RfcommPayload = {
      clientId: this.id,
      rfcomms: details,
    }
    socket.emit(ClientEmitEvent.BT_CONNECTED_DEVS, payload);
  }
  private getVisibleDevices = async (): Promise<void> => {
    const devices = await this.bluetooth.getVisibleDevices();
    const payload: DevicePropsPayload = {
      clientId: this.id,
      devices,
    }
    socket.emit(ClientEmitEvent.BT_VISIBLE_DEVS, payload);
  }
  private getAllBTInfo = async (): Promise<void> => {
    const [rfcomms, devices] = await Promise.all([this.bluetooth.getRfcommDetails(), this.bluetooth.getVisibleDevices()]);
    const payload: AllBTInfoPayload = {
      clientId: this.id,
      rfcomms,
      devices,
    }
    socket.emit(ClientEmitEvent.BT_ALL_DEV_INFO, payload);
  }
  private createRfcomm = (address: string) => {
    this.bluetooth.spawnRfcomm(address);
  }
  private releaseRfcomm = (device: number) => {
    this.bluetooth.releaseRfcomm(device);
  }
  private initBluez = (): void => {
    this.bluetooth.initialize();
  }
  private initSerial = (): NodeJS.Timeout => {
    if(this.scanPort) clearInterval(this.scanPort);
    this.scanPort = setInterval(this.scanNewMicros, 3000);
    return this.scanPort;
  }
  private initSocket = (): void => {
    socket.emit(ClientEmitEvent.INIT_LIGHT_CLIENT, this.id);
  }
}
