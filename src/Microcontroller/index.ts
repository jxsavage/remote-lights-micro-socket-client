import {
  generateId, convertMicroResponseToMicroEntity,
  MicroEntityActionType, MicroActionsInterface, createSegment,
} from 'Shared/store';
import {
  MicroId, SegmentId, MicroState,
  MicroStateResponse, MicroActionType,
} from 'Shared/types';
import {
  REVERSE_MICRO_COMMAND, MicroResponseHeader,
  MicroResponseCode, CommandArray, MicroCommand,
} from 'Shared/types/micro';
import { SerialWithParser } from 'SocketClient/serial';
import log from 'Shared/logger';
import { SharedEmitEvent } from 'Shared/socket';
import CommandQueue, { Command } from './CommandQueue';
import CMD from './Command';
import microTester from './microTester';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type fn = (a: any) => void;
export class Microcontroller implements MicroActionsInterface {
  initialized: boolean;
  serial: SerialWithParser;
  commandQueue: CommandQueue;
  socket: SocketIOClient.Socket;
  microId!: MicroState['microId'];
  writeSerialInterval: NodeJS.Timeout;
  initMsgInterval: NodeJS.Timeout | undefined;
  constructor(
    serialPort: SerialWithParser,
    socket: SocketIOClient.Socket,
  ) {
    this.socket = socket;
    this.serial = serialPort;
    this.initialized = false;
    this.commandQueue = new CommandQueue();
    this.serial.parser.on('data', this.dataHandler);
    this.writeSerialInterval = setInterval(() => {
      const command = this.commandQueue.next();
      if(command) {
        this.writeSerial(command.get());
      }
    }, 1);
  }
  writeSerial = (command: string): void => {
    log('info', `Writing Command to Serial: ${command}`);
    try {
      this.serial.port.write(`${command}\n`);
    } catch(err) {
      log('textRed', `[ ${this.serial.port.path} ] Error writing to port.`);
    }
    
    // this.serial.port.drain();
  }
  queueCommand = (command: CommandArray, cbs?: fn[]): void => {
    log('infoHeader', `Queueing command ${REVERSE_MICRO_COMMAND[command[0]-1]}`);
    const callbacks = cbs ? cbs : [];
    this.commandQueue.push(
      new Command({
        callbacks,
        command,
        meta: null,
        responseHeader: MicroResponseHeader.CONFIRM_COMMAND,
      }));
  }
  loadEEPROM = (): void => {
    log('info', `Loading EEPROM to Microcontroller ${this.microId}`);
    this.queueCommand(CMD.loadEEPROM());
  }
  writeEEPROM = (): void => {
    log('info', `Writing EEPROM to Microcontroller ${this.microId}`);
    this.queueCommand(CMD.writeEEPROM());
  }
  reset = (): void => {
    log('info', `Resetting Microcontroller ${this.microId}...`);
    this.queueCommand(CMD.resetMicro());
  }
  getMicroState = (): void => {
    this.queueCommand(CMD.getState(), [this.parseStateResponse]);
  }
  splitSegment:
  MicroActionsInterface['splitSegment'] = (payload) => {
    this.queueCommand(CMD.splitSegment(payload));
  }
  mergeSegments:
  MicroActionsInterface['mergeSegments'] = (payload) => {
    this.queueCommand(CMD.mergeSegments(payload));
  }
  resizeSegmentsFromBoundaries:
  MicroActionsInterface['resizeSegmentsFromBoundaries'] = (payload) => {
    this.queueCommand(CMD.resizeSegments(payload));
  }
  setMicroBrightness:
  MicroActionsInterface['setMicroBrightness'] = (
    payload
  ) => {
    this.queueCommand(CMD.setBrightness(payload));
  }
  setSegmentEffect:
  MicroActionsInterface['setSegmentEffect'] = (
    payload
  ) => {
    this.queueCommand(CMD.setSegmentEffect(payload));
  }
  setMicroId = (microId: MicroId): void => {
    log('info', `Setting microId to ${microId}`);
    this.queueCommand(CMD.setMicroId(microId));
  }
  setSegmentId = (oldId: SegmentId, newId: SegmentId): void => {
    this.queueCommand(CMD.setSegmentId(oldId, newId));
  }
  parseStateResponse = (microStateResponse: MicroStateResponse): void => {
    const entity = convertMicroResponseToMicroEntity(microStateResponse);
    const {micros, segments} = entity;
    const microId = micros.allIds[0];
    log('textGreen', `[ ${microId} ] State received`)
    const micro = micros.byId[microId];
    if(microId === 0) {
      const newMicroId = generateId();
      micros.allIds[0] = newMicroId;
      this.microId = newMicroId;
      log('bgRed', `microcontroller had an id of 0, re-initializing to ${newMicroId}`);
      micro.microId = newMicroId;
      this.setMicroId(newMicroId);
      const oldSegmentIds = micro.segmentIds.map(id => id);
      const newSegmentIds = oldSegmentIds.map((segId) => {
        const newId = generateId();
        this.setSegmentId(segId, newId);
        segments.allIds.push(newId);
        segments.allIds.shift();
        const {effect, effectControlledBy, numLEDs, offset} = segments.byId[segId];
        const newSegment = createSegment(
          newMicroId, offset, numLEDs,
          effect, newId, effectControlledBy);
        delete segments.byId[segId];
        segments.byId[newId] = newSegment;
        return newId;
      });
      const {brightness, segmentBoundaries, totalLEDs} = micros.byId[0];
      const alias = String(newMicroId);
      const newMicro = {
        alias,
        totalLEDs,
        brightness,
        segmentBoundaries,
        microId: newMicroId,
        segmentIds: newSegmentIds,

      }
      delete micros.byId[0];
      micros.byId[newMicroId] = newMicro;
    } else {
      this.microId = microId;
    }
    this.socket.emit(MicroEntityActionType.ADD_MICROS, entity);
  }
  dataHandler = (data: string): void => {
    try {
      const response = JSON.parse(data);
      const cmdId = response.shift();
      const responseType = response.shift();
      if (cmdId > 0) {
        this.commandQueue.call(cmdId, response);
      } else {
      logMicroResponse(response, responseType);
      }
    } catch(err) {
      console.log(`ERROR:\n${err}\nResponse:\n${data.toString()}\n`);
    }
  }
  private init = () => this.initialized = true;
  clean = (): void => {
    if (this.serial.port.isOpen) this.serial.port.close();
    clearInterval(this.writeSerialInterval);
    if(this.initMsgInterval) clearInterval(this.initMsgInterval);
    this.serial.port.removeAllListeners();
    this.socket.removeAllListeners();
    this.socket.close();
  }
  initialize = (): Promise<Microcontroller> => {
    return new Promise((resolve, reject) => {
      const msPerTick = 1000;
      const ticksToWait = 10;
      let currentTick = 0;
      this.initMsgInterval = setInterval(() => {
        log('textGreen',`[ ${this.serial.port.path} ] waiting for initialization (${currentTick})`);
        if(currentTick>=ticksToWait) {
          if(this.initMsgInterval) clearInterval(this.initMsgInterval);
          this.clean();
          if (this.serial.port.isOpen) this.serial.port.close();
          
          reject(`Timeout waiting for Micro at ${this.serial.port.path}`);
        } 
        currentTick++;
      }, msPerTick);
      const initializing = setInterval((resolve) => {
        if(this.microId) {
          log('info', ` Microconroller: ${this.microId} - ${this.serial.port.path} initialized. `);
          this.initialized = true;
          resolve(this);
          clearInterval(initializing);
          if(this.initMsgInterval) clearInterval(this.initMsgInterval);
          const { socket, microId } = this;
          socket.emit('INIT_MICRO', microId);
          socket.on(MicroActionType.RESET_MICRO, this.reset);
          socket.on(MicroCommand.LOAD_EEPROM, this.loadEEPROM);
          socket.on(MicroCommand.WRITE_EEPROM, this.writeEEPROM);
          socket.on(MicroActionType.SPLIT_SEGMENT, this.splitSegment);
          socket.on(MicroActionType.MERGE_SEGMENTS, this.mergeSegments);
          socket.on(SharedEmitEvent.RE_INIT_APP_STATE, this.getMicroState);
          socket.on(MicroActionType.SET_SEGMENT_EFFECT, this.setSegmentEffect);
          socket.on(MicroActionType.SET_MICRO_BRIGHTNESS, this.setMicroBrightness);
          socket.on(MicroActionType.RESIZE_SEGMENTS_FROM_BOUNDARIES, this.resizeSegmentsFromBoundaries);
        }
      }, 100, resolve);
      // microTester(this, this.commandQueue);
      this.getMicroState();
    });
  }
}
const { ERROR, WARNING, INFO, DEBUG, PING } = MicroResponseCode;
function logMicroResponse(response: number[], responseType: number): void {
  switch(responseType) {
    case ERROR:
    case WARNING:
    case INFO:
    case DEBUG:
    case PING:
      response.forEach((value, i) => {
        const colors: Parameters<typeof log>[0][] = [
          'bgGreen', 'textGreen', 
          'bgRed', 'textRed', 
          'bgYellow', 'textYellow',
        ];
        if (i === 0) {
          log('info', `${MicroResponseCode[value]}`);
        } else {
          log(colors[(i-1)%6], `${value}`);
        }
      });
      
      log('infoHeader', `${new Date().getMinutes()}:${new Date().getSeconds()}`);
      break;
    default:
      log('bgRed', `Error: Uknown response type:`);
      log('textRed', JSON.stringify(response, null,'  '));
  }
}
export default Microcontroller;