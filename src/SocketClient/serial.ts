import SerialPort, { parsers } from 'serialport';
import MicroController from '../MicroController';
import {
  MicroState, removeMicros, AllActions,
} from '../Shared/store';
import { SocketDestination } from '../Shared/socket';
import getSocket, { addMicroChannel, getMicroSocketInstance } from './socket';
import log from '../Shared/logger';
import {readdir} from 'fs';



/**
 * Scans for serials based on path.
 * Looks for /dev/teensy[0-9]+
 * @returns Array of PortInfo about valid microcontrollers.
 */
export function scanSerial(): Promise<SerialPort.PortInfo[]> {
  return new Promise((resolve, reject) => {
    readdir('/dev', (err, files) => {
      if(err) {
        log('bgRed', err.message)
        reject(err)
      }
        
      const teensy = /teensy[0-9]+/
      const connectedMicros = files.reduce((prev, path) => {
        if(teensy.test(path))
          prev.push({path:`/dev/${path}`})
        return prev
      }, [] as SerialPort.PortInfo[])
      resolve(connectedMicros as SerialPort.PortInfo[])
    })
    // list().then((serialPortList) => {
    //   const connectedMicros = serialPortList.filter((portInfo) => {
    //     return portInfo.productId === '0483';
    //   });
    //   resolve(connectedMicros);
    // });
  });
}
const {Readline} = parsers;
interface SerialPortDisconnectReason {
  disconnected: boolean;
  message: string;
  stack: string;
}
export const microIdSerialMap = new Map<MicroState['microId'], MicroController>();
type portPath = string;
export type SerialWithParser = {
  port: SerialPort;
  parser: parsers.Readline;
}
const portPathSerialMap = new Map<portPath, SerialPort>();
const socket = getSocket();
/**
 * Attaches to a known microcontroller and attaches
 * readline parser and 'close' event listener.
 * @param portInfo known microcontroller port
 * @returns Serial port connection with parser attached.
 */
export function initSerialPort(portInfo: SerialPort.PortInfo): SerialWithParser {
  const {path} = portInfo;
  log('bgGreen', `Connecting to microcontroller on port ${path}`);
  const parser = new Readline({delimiter:'\n', encoding: 'utf8'});

  const openOptions = {
    autoOpen: true,
    baudRate: 115200,
    lock: false,
  }
  const port = new SerialPort (
    path,
    openOptions
  );
  port.pipe(parser);
  portPathSerialMap.set(port.path, port);
  port.on('close', ({disconnected, message, stack}: SerialPortDisconnectReason) => {
    log('bgRed', `Serial port ${port.path} disconnect detected.`);
    log('bgRed', `Was disconnected? ${disconnected}`);
    log('bgRed', `Message: ${message}`);
    log('bgRed', `Stack: ${stack}`);
    log('bgRed', `Removing listeners and deleting from map...`);
    port.removeAllListeners();
    portPathSerialMap.delete(port.path);
    socket.emit('PORT_DISCONNECT', {portPath: port.path, message});
  });
  return {port, parser};
}

export function scanNewMicros(dispatchAndEmit: (action: AllActions, destination: string) => void): () => void {
  return function scan(): void {
    scanSerial().then((portInfoArr) => {
      const uninitialized = portInfoArr.filter((portInfo)=>{
        return !portPathSerialMap.has(portInfo.path);
      });
      const newSerialConnections = uninitialized.map((portInfo) => {
        return new MicroController(initSerialPort(portInfo), dispatchAndEmit, getMicroSocketInstance());
      });

      Promise.all(newSerialConnections.map(micro => micro.initialize()))
      .then((microArr: MicroController[])=>{
        microArr.forEach((micro) => {
          const { microId } = micro;
          addMicroChannel(microId);
          microIdSerialMap.set(microId, micro);
          
          micro.serial.port.on('close', () => {
            log('bgRed', `Connection to microcontroller ${microId} closed. Removing microcontroller instance...`);
            microIdSerialMap.delete(microId);
          });
          micro.serial.port.on('disconnect', () => {
            dispatchAndEmit(
              removeMicros({microIds: [microId]}),
              SocketDestination.WEB_CLIENTS
            );
            
            log('bgRed', `SerialPort ${microId} disconnect microInit listener.`);
          });
        });
      })
      .catch((reason) => {
        log('bgRed', `Error adding new serial connection: ${reason}`);
      });
    })
    // .catch((reason) => {
    //   log('bgRed', `Error scanning new serial connections: ${reason}`)
    // });
  }
}