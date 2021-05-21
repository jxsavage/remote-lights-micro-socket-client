import SerialPort, { parsers, list } from 'serialport';
import getSocket from './socket';
import log from 'Shared/logger';
import { readdir } from 'fs/promises';

/**
 * Scans for serials based on path.
 * Looks for /dev/teensy[0-9]+
 * @returns Array of PortInfo about valid microcontrollers.
 */
export  async function scanSerial(): Promise<SerialPort.PortInfo[]> {
  const serialList = await list();
  const paths = serialList.map((port) => port.path);
  const devices = await readdir('/dev');
  const teensy = /teensy[0-9]+/
  const bluetooth = /rfcomm[0-9]+/
  return devices.reduce((pathList, path) => {
    if(teensy.test(path) || bluetooth.test(path))
      pathList.push({path:`/dev/${path}`});
    return pathList;
  }, [] as SerialPort.PortInfo[]);
}
const {Readline} = parsers;
interface SerialPortDisconnectReason {
  disconnected: boolean;
  message: string;
  stack: string;
}

export type SerialWithParser = {
  port: SerialPort;
  parser: parsers.Readline;
}
const socket = getSocket();
/**
 * Attaches to a known microcontroller and attaches
 * readline parser and 'close' event listener.
 * @param portInfo known microcontroller port
 * @returns Serial port connection with parser attached.
 */
export async function initSerialPort(portInfo: SerialPort.PortInfo): Promise<SerialWithParser> {
  const {path} = portInfo;
  log('bgGreen', `Connecting to microcontroller on port ${path}`);
  const parser = new Readline({delimiter:'\n', encoding: 'utf8'});
  const openOptions = {
    autoOpen: false,
    baudRate: 115200,
    lock: false,
  }
  const port = new SerialPort (
    path,
    openOptions
  );
  await new Promise<void>((resolve, reject) => {
    port.open((err) => {
      if(err) {
        reject(err);
      } else {
        resolve();
      }
    })
  });
  
  port.pipe(parser);
  // portPathSerialMap.set(port.path, port);
  port.on('close', (reason: SerialPortDisconnectReason | null) => {
    log('bgRed', ` Serial port ${port.path} disconnect detected. `);
    log('textRed', `Removing listeners and deleting from map...`);
    port.removeAllListeners();
    // portPathSerialMap.delete(port.path);
    // socket.emit('PORT_DISCONNECT', {portPath: port.path, message});
  });
  return {port, parser};
}

